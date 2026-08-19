import { io, type Socket } from 'socket.io-client';
import {
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_SOCKET_EVENT,
  isGatewayConnectErrorData,
  isGatewayServerMessage,
  type GatewayClientMessage,
  type GatewayClaimCandidateMessage,
  type GatewayMatchmakingJoinMessage,
  type GatewayServerMessage,
  type GatewaySocketAuth,
  type GatewayTelemetryEnvelope
} from '@skribbl-duels/gateway-contracts';
import type {
  GatewayConnectionSnapshot,
  SocketIoGatewayClientOptions
} from './types';

interface ServerToClientEvents {
  'gateway:message': (message: GatewayServerMessage) => void;
}

interface ClientToServerEvents {
  'gateway:message': (message: GatewayClientMessage) => void;
}

type GatewaySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface GatewayResumeCursor {
  matchId: string;
  revision: number;
}

function initialSnapshot(endpoint: string | null): GatewayConnectionSnapshot {
  return {
    status: endpoint ? 'signed-out' : 'not-configured',
    endpoint,
    connectionId: null,
    identity: null,
    connectedAt: null,
    serverTimeOffsetMs: null,
    queue: null,
    match: null,
    lastMatchEvent: null,
    duelChatMessages: [],
    lastClaimResolution: null,
    telemetryAck: null,
    error: null
  };
}

function errorMessage(error: Error & { data?: unknown }): string {
  if (isGatewayConnectErrorData(error.data)) {
    return error.data.type === 'AUTH_REQUIRED'
      ? `Gateway authentication required: ${error.data.reason}.`
      : error.data.message;
  }
  return error.message || 'Unable to connect to the Skribbl Duels Gateway.';
}

export class SocketIoGatewayClient {
  private state: GatewayConnectionSnapshot;
  private listeners = new Set<(state: GatewayConnectionSnapshot) => void>();
  private socket: GatewaySocket | null = null;
  private accessToken: string | null = null;
  private resumeCursor: GatewayResumeCursor | null;
  private telemetryQueue: GatewayTelemetryEnvelope[] = [];
  private telemetryInFlight: GatewayTelemetryEnvelope[] = [];
  private telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingClaims: Array<Omit<GatewayClaimCandidateMessage, 'type'>> = [];

  public constructor(private readonly options: SocketIoGatewayClientOptions) {
    this.state = initialSnapshot(options.endpoint);
    this.resumeCursor = this.loadResumeCursor();
  }

  public getState(): GatewayConnectionSnapshot {
    return structuredClone(this.state);
  }

  public subscribe(listener: (state: GatewayConnectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public setAccessToken(accessToken: string | null): void {
    const normalized = typeof accessToken === 'string' && accessToken.length > 0
      ? accessToken
      : null;
    const changed = normalized !== this.accessToken;
    this.accessToken = normalized;

    if (!this.options.endpoint) {
      this.disconnectSocket();
      this.update(initialSnapshot(null));
      return;
    }
    if (!this.accessToken) {
      this.disconnectSocket();
      this.clearTelemetryQueue();
      this.clearResumeCursor();
      this.update(initialSnapshot(this.options.endpoint));
      return;
    }
    if (!changed && (this.socket?.connected || this.state.status === 'connecting')) return;
    this.connect();
  }

  public reconnect(): void {
    if (!this.options.endpoint) {
      this.update(initialSnapshot(null));
      return;
    }
    if (!this.accessToken) {
      this.update(initialSnapshot(this.options.endpoint));
      return;
    }
    this.connect();
  }

  public stop(): void {
    this.accessToken = null;
    this.disconnectSocket();
    this.clearTelemetryQueue();
    this.update(initialSnapshot(this.options.endpoint));
    this.listeners.clear();
  }

  public joinMatchmaking(format: GatewayMatchmakingJoinMessage['format']): string {
    const requestId = this.createRequestId('queue');
    this.emit({
      type: 'MATCHMAKING_JOIN',
      requestId,
      format,
      page: 'home'
    });
    this.clearResumeCursor();
    this.clearTelemetryQueue();
    this.update({
      ...this.state,
      queue: null,
      match: null,
      lastMatchEvent: null,
      duelChatMessages: [],
      lastClaimResolution: null,
      telemetryAck: null,
      error: null
    });
    return requestId;
  }

  public leaveMatchmaking(): string {
    const requestId = this.createRequestId('leave');
    this.emit({ type: 'MATCHMAKING_LEAVE', requestId });
    this.clearResumeCursor();
    this.clearTelemetryQueue();
    return requestId;
  }

  public setReady(matchId: string, ready: boolean): void {
    this.emit({ type: 'READY_SET', matchId, ready });
  }

  public pickDraftChallenge(matchId: string, challengeId: string, clientRevision: number): void {
    this.emit({
      type: 'DRAFT_PICK',
      matchId,
      challengeId,
      clientRevision
    });
  }

  public sendDuelChat(matchId: string, message: string): string {
    const clientMessageId = this.createRequestId('chat');
    this.emit({ type: 'DUEL_CHAT_SEND', matchId, clientMessageId, message });
    return clientMessageId;
  }

  public forfeitMatch(matchId: string): string {
    const actionId = this.createRequestId('forfeit');
    this.emit({ type: 'MATCH_FORFEIT', matchId, actionId });
    return actionId;
  }

  public requestRematch(matchId: string): string {
    const actionId = this.createRequestId('rematch');
    this.emit({ type: 'MATCH_REMATCH', matchId, actionId });
    return actionId;
  }

  public proposeDraw(matchId: string): string {
    const actionId = this.createRequestId('draw-propose');
    this.emit({ type: 'DRAW_PROPOSE', matchId, actionId });
    return actionId;
  }

  public respondToDraw(matchId: string, proposalId: string, accept: boolean): string {
    const actionId = this.createRequestId(accept ? 'draw-accept' : 'draw-reject');
    this.emit({ type: 'DRAW_RESPOND', matchId, proposalId, actionId, accept });
    return actionId;
  }

  public withdrawDraw(matchId: string, proposalId: string): string {
    const actionId = this.createRequestId('draw-withdraw');
    this.emit({ type: 'DRAW_WITHDRAW', matchId, proposalId, actionId });
    return actionId;
  }

  public queueTelemetryEnvelope(envelope: GatewayTelemetryEnvelope): void {
    if (this.state.match?.matchId !== envelope.matchId) return;
    if (this.telemetryQueue.some(item => item.sequence === envelope.sequence)) return;
    this.telemetryQueue.push(structuredClone(envelope));
    this.telemetryQueue.sort((left, right) => left.sequence - right.sequence);
    if (this.telemetryQueue.length >= 64) {
      this.flushTelemetry();
      return;
    }
    if (this.telemetryFlushTimer === null) {
      this.telemetryFlushTimer = setTimeout(() => {
        this.telemetryFlushTimer = null;
        this.flushTelemetry();
      }, 40);
    }
  }

  public submitClaimCandidate(
    message: Omit<GatewayClaimCandidateMessage, 'type'>
  ): void {
    if (!this.pendingClaims.some(candidate =>
      candidate.matchId === message.matchId && candidate.candidateId === message.candidateId
    )) this.pendingClaims.push(structuredClone(message));
    this.flushTelemetry();
    this.flushClaims();
  }

  private connect(): void {
    const endpoint = this.options.endpoint;
    const accessToken = this.accessToken;
    if (!endpoint || !accessToken) return;

    this.disconnectSocket();
    const auth: GatewaySocketAuth = { accessToken };
    const socket: GatewaySocket = io(endpoint, {
      autoConnect: false,
      auth,
      reconnection: true,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      timeout: 10_000
    });
    this.socket = socket;
    this.update({
      ...this.state,
      endpoint,
      connectionId: null,
      connectedAt: null,
      status: 'connecting',
      error: null
    });

    socket.on('connect', () => {
      const hello: GatewayClientMessage = {
        type: 'HELLO',
        contractVersion: GATEWAY_CONTRACT_VERSION,
        clientVersion: this.options.clientVersion,
        capabilities: this.options.capabilities,
        ...(this.resumeCursor ? {
          resumeMatchId: this.resumeCursor.matchId,
          lastServerRevision: this.resumeCursor.revision
        } : {})
      };
      socket.emit(GATEWAY_SOCKET_EVENT, hello);
    });
    socket.on(GATEWAY_SOCKET_EVENT, message => this.receive(message));
    socket.on('connect_error', rawError => {
      const error = rawError as Error & { data?: unknown };
      this.update({
        ...this.state,
        endpoint,
        status: socket.active ? 'connecting' : 'error',
        error: errorMessage(error)
      });
    });
    socket.on('disconnect', reason => {
      if (!this.accessToken || this.socket !== socket) return;
      this.requeueTelemetryInFlight();
      this.update({
        ...this.state,
        endpoint,
        connectionId: null,
        connectedAt: null,
        status: socket.active ? 'connecting' : 'error',
        error: socket.active ? null : `Gateway disconnected: ${reason}.`
      });
    });
    socket.connect();
  }

  private receive(value: unknown): void {
    if (!isGatewayServerMessage(value)) {
      this.update({
        ...this.state,
        status: 'error',
        error: `Gateway sent an invalid Contract v${GATEWAY_CONTRACT_VERSION} message.`
      });
      return;
    }
    if (value.type === 'WELCOME') {
      const resumed = value.resumedMatchId !== null
        && (this.state.match === null || this.state.match.matchId === value.resumedMatchId);
      if (!resumed) this.clearResumeCursor();
      this.update({
        status: 'connected',
        endpoint: this.options.endpoint,
        connectionId: value.connectionId,
        identity: value.identity,
        connectedAt: Date.now(),
        serverTimeOffsetMs: value.serverTime - Date.now(),
        queue: resumed ? this.state.queue : null,
        match: resumed ? this.state.match : null,
        lastMatchEvent: resumed ? this.state.lastMatchEvent : null,
        duelChatMessages: resumed ? this.state.duelChatMessages : [],
        lastClaimResolution: resumed ? this.state.lastClaimResolution : null,
        telemetryAck: resumed ? this.state.telemetryAck : null,
        error: null
      });
      return;
    }
    if (value.type === 'AUTH_REQUIRED') {
      this.update({
        ...initialSnapshot(this.options.endpoint),
        status: 'error',
        error: `Gateway authentication required: ${value.reason}.`
      });
      return;
    }
    if (value.type === 'ERROR') {
      this.update({
        ...this.state,
        status: value.recoverable && this.state.connectionId ? this.state.status : 'error',
        error: value.message
      });
      return;
    }
    if (value.type === 'QUEUE_STATUS') {
      this.update({
        ...this.state,
        queue: value.queued ? structuredClone(value) : null,
        match: value.queued ? null : this.state.match,
        lastMatchEvent: value.queued ? null : this.state.lastMatchEvent,
        error: null
      });
      return;
    }
    if (value.type === 'MATCH_SNAPSHOT') {
      if (this.state.match?.matchId === value.matchId && this.state.match.revision > value.revision) return;
      const sameMatch = this.state.match?.matchId === value.matchId;
      const sameTelemetryMatch = sameMatch || this.state.telemetryAck?.matchId === value.matchId;
      // A direct rematch does not pass through joinMatchmaking(), so the last
      // telemetry batch of the finished match can still be in flight. If it
      // remains at the front of the queue, the new match never reaches the
      // server and every local completion stays pending forever.
      if (!sameMatch) this.clearTelemetryQueue();
      if (value.state.phase === 'cancelled') this.clearResumeCursor();
      else this.setResumeCursor(value.matchId, value.revision);
      this.update({
        ...this.state,
        queue: null,
        match: structuredClone(value),
        duelChatMessages: sameMatch ? this.state.duelChatMessages : [],
        lastClaimResolution: sameMatch ? this.state.lastClaimResolution : null,
        telemetryAck: sameTelemetryMatch ? this.state.telemetryAck : null,
        error: null
      });
      return;
    }
    if (value.type === 'MATCH_EVENT') {
      if (this.state.lastMatchEvent?.matchId === value.matchId &&
          this.state.lastMatchEvent.revision > value.revision) return;
      this.update({ ...this.state, lastMatchEvent: structuredClone(value), error: null });
      return;
    }
    if (value.type === 'DUEL_CHAT_MESSAGE') {
      if (this.state.match?.matchId !== value.matchId) return;
      const existing = this.state.duelChatMessages.some(message => message.messageId === value.messageId);
      const duelChatMessages = existing
        ? this.state.duelChatMessages
        : [...this.state.duelChatMessages, structuredClone(value)].slice(-100);
      this.update({ ...this.state, duelChatMessages, error: null });
      return;
    }
    if (value.type === 'CLAIM_RESOLUTION') {
      if (this.state.match?.matchId !== value.matchId) return;
      this.update({ ...this.state, lastClaimResolution: structuredClone(value), error: null });
      return;
    }
    if (value.type === 'TELEMETRY_ACK') {
      if (this.state.match?.matchId !== value.matchId && this.resumeCursor?.matchId !== value.matchId) return;
      this.telemetryQueue = this.telemetryQueue.filter(envelope =>
        envelope.matchId === value.matchId && envelope.sequence > value.lastSequence
      );
      this.telemetryInFlight = this.telemetryInFlight.filter(envelope =>
        envelope.matchId === value.matchId && envelope.sequence > value.lastSequence
      );
      if (this.telemetryInFlight.length > 0) {
        this.telemetryQueue.push(...this.telemetryInFlight);
        this.telemetryQueue.sort((left, right) => left.sequence - right.sequence);
        this.telemetryInFlight = [];
      }
      this.update({ ...this.state, telemetryAck: structuredClone(value), error: null });
      if (this.telemetryQueue.length > 0) this.flushTelemetry();
      this.flushClaims();
    }
  }

  private emit(message: GatewayClientMessage): void {
    if (this.state.status !== 'connected' || !this.socket?.connected) {
      throw new Error('The authenticated Gateway must be connected before matchmaking.');
    }
    this.socket.emit(GATEWAY_SOCKET_EVENT, message);
  }

  private flushTelemetry(): void {
    if (this.telemetryFlushTimer !== null) clearTimeout(this.telemetryFlushTimer);
    this.telemetryFlushTimer = null;
    if (this.telemetryInFlight.length > 0
        || this.telemetryQueue.length === 0
        || this.state.status !== 'connected'
        || !this.socket?.connected) return;
    const matchId = this.telemetryQueue[0]?.matchId;
    if (!matchId) return;
    const batch: GatewayTelemetryEnvelope[] = [];
    for (const envelope of this.telemetryQueue) {
      if (envelope.matchId !== matchId || batch.length >= 64) break;
      const expected = batch.length === 0
        ? envelope.sequence
        : batch[batch.length - 1]!.sequence + 1;
      if (envelope.sequence !== expected) break;
      batch.push(envelope);
    }
    if (batch.length === 0) return;
    this.telemetryQueue.splice(0, batch.length);
    this.telemetryInFlight = batch;
    this.emit({
      type: 'TELEMETRY_BATCH',
      matchId,
      firstSequence: batch[0]!.sequence,
      lastSequence: batch[batch.length - 1]!.sequence,
      envelopes: batch
    });
  }

  private clearTelemetryQueue(): void {
    if (this.telemetryFlushTimer !== null) clearTimeout(this.telemetryFlushTimer);
    this.telemetryFlushTimer = null;
    this.telemetryQueue = [];
    this.telemetryInFlight = [];
    this.pendingClaims = [];
  }

  private flushClaims(): void {
    if (this.state.status !== 'connected' || !this.socket?.connected) return;
    const matchId = this.state.match?.matchId;
    const telemetryAck = this.state.telemetryAck;
    const lastSequence = telemetryAck && telemetryAck.matchId === matchId
      ? telemetryAck.lastSequence
      : 0;
    const ready = this.pendingClaims.filter(candidate =>
      candidate.matchId === matchId && candidate.throughSequence <= lastSequence
    );
    this.pendingClaims = this.pendingClaims.filter(candidate => !ready.includes(candidate));
    for (const candidate of ready) this.emit({ type: 'CLAIM_CANDIDATE', ...candidate });
  }

  private requeueTelemetryInFlight(): void {
    if (this.telemetryInFlight.length === 0) return;
    const sequences = new Set(this.telemetryQueue.map(envelope => `${envelope.matchId}:${envelope.sequence}`));
    for (const envelope of this.telemetryInFlight) {
      const key = `${envelope.matchId}:${envelope.sequence}`;
      if (!sequences.has(key)) this.telemetryQueue.push(envelope);
    }
    this.telemetryQueue.sort((left, right) => left.sequence - right.sequence);
    this.telemetryInFlight = [];
  }

  private createRequestId(prefix: string): string {
    const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  private resumeStorageKey(): string | null {
    return this.options.endpoint ? `skribblDuelsGatewayResumeV1:${this.options.endpoint}` : null;
  }

  private loadResumeCursor(): GatewayResumeCursor | null {
    const key = this.resumeStorageKey();
    if (!key) return null;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Partial<GatewayResumeCursor> | null;
      return value
        && typeof value.matchId === 'string'
        && value.matchId.length > 0
        && Number.isInteger(value.revision)
        && Number(value.revision) >= 0
        ? { matchId: value.matchId, revision: Number(value.revision) }
        : null;
    } catch {
      return null;
    }
  }

  private setResumeCursor(matchId: string, revision: number): void {
    this.resumeCursor = { matchId, revision };
    const key = this.resumeStorageKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(this.resumeCursor));
    } catch {
      // Reconnect still works for the current page when storage is unavailable.
    }
  }

  private clearResumeCursor(): void {
    this.resumeCursor = null;
    const key = this.resumeStorageKey();
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage cleanup is best-effort only.
    }
  }

  private disconnectSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    this.requeueTelemetryInFlight();
    socket.removeAllListeners();
    socket.disconnect();
  }

  private update(state: GatewayConnectionSnapshot): void {
    this.state = structuredClone(state);
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
