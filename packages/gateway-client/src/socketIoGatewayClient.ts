import { io, type Socket } from 'socket.io-client';
import {
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_SOCKET_EVENT,
  isGatewayConnectErrorData,
  isGatewayServerMessage,
  type GatewayClientMessage,
  type GatewayClaimCandidateMessage,
  type GatewayInviteCreateMessage,
  type GatewayMatchmakingJoinMessage,
  type GatewayServerMessage,
  type GatewaySocketAuth,
  type GatewayTelemetryEnvelope
} from '@skribbl-duels/gateway-contracts';
import type {
  GatewayConnectionSnapshot,
  GatewayTransportStats,
  SocketIoGatewayClientOptions
} from './types';

interface ServerToClientEvents {
  'gateway:message': (message: GatewayServerMessage) => void;
}

interface ClientToServerEvents {
  'gateway:message': (message: GatewayClientMessage) => void;
}

type GatewaySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const TELEMETRY_FLUSH_DELAY_MS = 150;

interface GatewayResumeCursor {
  matchId: string;
  revision: number;
}

interface GatewayPendingTransportSnapshot {
  version: 1;
  matchId: string;
  telemetryQueue: GatewayTelemetryEnvelope[];
  telemetryInFlight: GatewayTelemetryEnvelope[];
  pendingClaims: Array<Omit<GatewayClaimCandidateMessage, 'type'>>;
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
    invite: null,
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
  private dismissedMatchIds = new Set<string>();
  private socket: GatewaySocket | null = null;
  private accessToken: string | null = null;
  private resumeCursor: GatewayResumeCursor | null;
  private telemetryQueue: GatewayTelemetryEnvelope[] = [];
  private telemetryInFlight: GatewayTelemetryEnvelope[] = [];
  private telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private transportRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingClaims: Array<Omit<GatewayClaimCandidateMessage, 'type'>> = [];

  public constructor(private readonly options: SocketIoGatewayClientOptions) {
    this.state = initialSnapshot(options.endpoint);
    this.resumeCursor = this.loadResumeCursor();
    this.restorePendingTransport();
  }

  public getState(): GatewayConnectionSnapshot {
    return structuredClone(this.state);
  }

  /** A read-only view of the durable telemetry/claim transport for live certification. */
  public getTransportStats(): GatewayTransportStats {
    const matchId = this.state.match?.matchId
      ?? this.telemetryInFlight[0]?.matchId
      ?? this.telemetryQueue[0]?.matchId
      ?? this.pendingClaims[0]?.matchId
      ?? null;
    return {
      matchId,
      queuedTelemetry: this.telemetryQueue.length,
      inFlightTelemetry: this.telemetryInFlight.length,
      pendingClaimCandidates: this.pendingClaims.length,
      acknowledgedSequence: this.state.telemetryAck?.matchId === matchId
        ? this.state.telemetryAck.lastSequence
        : 0
    };
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
    this.requeueTelemetryInFlight();
    if (this.transportRetryTimer !== null) clearTimeout(this.transportRetryTimer);
    this.transportRetryTimer = null;
    this.accessToken = null;
    this.disconnectSocket();
    this.persistPendingTransport();
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
      invite: null,
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

  /**
   * Forget a terminal Match locally after the player leaves its result view.
   * The server remains authoritative and still receives MATCHMAKING_LEAVE; this
   * guard merely prevents a late terminal snapshot from reopening the old UI.
   */
  public dismissMatch(matchId: string): void {
    this.dismissedMatchIds.add(matchId);
    while (this.dismissedMatchIds.size > 16) {
      const oldest = this.dismissedMatchIds.values().next().value as string | undefined;
      if (!oldest) break;
      this.dismissedMatchIds.delete(oldest);
    }
    if (this.state.match?.matchId !== matchId) return;
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
  }

  /** Remove a no-longer-actionable invite from the local matchmaking view. */
  public dismissInvite(inviteId: string): void {
    if (this.state.invite?.inviteId !== inviteId) return;
    this.update({ ...this.state, invite: null, error: null });
  }

  public createInvite(format: GatewayInviteCreateMessage['format']): string {
    const requestId = this.createRequestId('invite-create');
    this.emit({ type: 'INVITE_CREATE', requestId, format, page: 'home' });
    return requestId;
  }

  public acceptInvite(token: string): string {
    const requestId = this.createRequestId('invite-accept');
    this.emit({ type: 'INVITE_ACCEPT', requestId, token, page: 'home' });
    return requestId;
  }

  public cancelInvite(inviteId: string): string {
    const requestId = this.createRequestId('invite-cancel');
    this.emit({ type: 'INVITE_CANCEL', requestId, inviteId });
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
    this.persistPendingTransport();
    if (envelope.event.type === 'CREDITS_LINK_CLICKED') {
      this.flushTelemetry();
      return;
    }
    if (this.telemetryQueue.length >= 64) {
      this.flushTelemetry();
      return;
    }
    if (this.telemetryFlushTimer === null) {
      this.telemetryFlushTimer = setTimeout(() => {
        this.telemetryFlushTimer = null;
        this.flushTelemetry();
      }, TELEMETRY_FLUSH_DELAY_MS);
    }
  }

  public submitClaimCandidate(
    message: Omit<GatewayClaimCandidateMessage, 'type'>
  ): void {
    if (!this.pendingClaims.some(candidate =>
      candidate.matchId === message.matchId && candidate.candidateId === message.candidateId
    )) {
      this.pendingClaims.push(structuredClone(message));
      this.persistPendingTransport();
    }
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
      transports: ['websocket'],
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
      if (!resumed) {
        this.clearResumeCursor();
        this.clearTelemetryQueue();
      }
      this.update({
        status: 'connected',
        endpoint: this.options.endpoint,
        connectionId: value.connectionId,
        identity: value.identity,
        connectedAt: Date.now(),
        serverTimeOffsetMs: value.serverTime - Date.now(),
        queue: resumed ? this.state.queue : null,
        invite: this.state.invite,
        match: resumed ? this.state.match : null,
        lastMatchEvent: resumed ? this.state.lastMatchEvent : null,
        duelChatMessages: resumed ? this.state.duelChatMessages : [],
        lastClaimResolution: resumed ? this.state.lastClaimResolution : null,
        telemetryAck: resumed ? this.state.telemetryAck : null,
        error: null
      });
      // A navigation (most notably /credits for Bloodline) can interrupt the
      // page after telemetry and dependent claim candidates were persisted but
      // before the Gateway acknowledged them. Restoring the queue alone is not
      // sufficient: WELCOME is the first point at which the replacement socket
      // is authenticated and able to resume delivery.
      this.flushTelemetry();
      this.flushClaims();
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
      if (value.recoverable
          && (value.code === 'REALTIME_AUTHORITY_UNAVAILABLE' || value.code === 'GATEWAY_COMMAND_FAILED')) {
        this.requeueTelemetryInFlight();
        this.scheduleTransportRetry();
      }
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
    if (value.type === 'INVITE_STATUS') {
      this.update({
        ...this.state,
        queue: null,
        invite: value.status === 'waiting' ? structuredClone(value) : null,
        error: null
      });
      return;
    }
    if (value.type === 'MATCH_SNAPSHOT') {
      if (this.dismissedMatchIds.has(value.matchId)) return;
      if (this.state.match?.matchId === value.matchId && this.state.match.revision > value.revision) return;
      const sameMatch = this.state.match?.matchId === value.matchId;
      const transportMatchId = this.pendingTransportMatchId();
      const sameTelemetryMatch = sameMatch
        || this.state.telemetryAck?.matchId === value.matchId
        || transportMatchId === value.matchId;
      // A direct rematch does not pass through joinMatchmaking(), so the last
      // telemetry batch of the finished match can still be in flight. If it
      // remains at the front of the queue, the new match never reaches the
      // server and every local completion stays pending forever.
      if (!sameTelemetryMatch) this.clearTelemetryQueue();
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
      // Consumers synchronously receive the terminal snapshot above, then the
      // transport releases it so cancelled Ready checks cannot trap the UI.
      if (value.state.phase === 'cancelled' && this.state.match?.matchId === value.matchId) {
        this.update({
          ...this.state,
          match: null,
          duelChatMessages: [],
          lastClaimResolution: null,
          telemetryAck: null
        });
      }
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
      this.pendingClaims = this.pendingClaims.filter(candidate =>
        candidate.matchId !== value.matchId
        || (candidate.candidateId !== value.candidateId
          && !(value.accepted
            && value.ownerAccountId === this.state.identity?.accountId
            && candidate.challengeId === value.challengeId))
      );
      this.persistPendingTransport();
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
      this.persistPendingTransport();
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
    this.persistPendingTransport();
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
    if (this.transportRetryTimer !== null) clearTimeout(this.transportRetryTimer);
    this.telemetryFlushTimer = null;
    this.transportRetryTimer = null;
    this.telemetryQueue = [];
    this.telemetryInFlight = [];
    this.pendingClaims = [];
    this.removePendingTransport();
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
    this.persistPendingTransport();
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
    this.persistPendingTransport();
  }

  private scheduleTransportRetry(): void {
    if (this.transportRetryTimer !== null) return;
    this.transportRetryTimer = setTimeout(() => {
      this.transportRetryTimer = null;
      this.flushTelemetry();
      this.flushClaims();
    }, 1_000);
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

  private pendingTransportStorageKey(): string | null {
    return this.options.endpoint ? `skribblDuelsGatewayPendingV1:${this.options.endpoint}` : null;
  }

  private pendingTransportMatchId(): string | null {
    return this.telemetryQueue[0]?.matchId
      ?? this.telemetryInFlight[0]?.matchId
      ?? this.pendingClaims[0]?.matchId
      ?? null;
  }

  private restorePendingTransport(): void {
    const key = this.pendingTransportStorageKey();
    if (!key) return;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Partial<GatewayPendingTransportSnapshot> | null;
      if (!value
          || value.version !== 1
          || typeof value.matchId !== 'string'
          || value.matchId.length === 0
          || !Array.isArray(value.telemetryQueue)
          || !Array.isArray(value.telemetryInFlight)
          || !Array.isArray(value.pendingClaims)) return;

      const envelopes = [...value.telemetryQueue, ...value.telemetryInFlight]
        .filter((envelope): envelope is GatewayTelemetryEnvelope => Boolean(
          envelope
          && envelope.matchId === value.matchId
          && Number.isInteger(envelope.sequence)
          && envelope.sequence > 0
        ));
      const bySequence = new Map<number, GatewayTelemetryEnvelope>();
      for (const envelope of envelopes) bySequence.set(envelope.sequence, structuredClone(envelope));
      this.telemetryQueue = [...bySequence.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .slice(-512);
      this.telemetryInFlight = [];
      this.pendingClaims = value.pendingClaims
        .filter((candidate): candidate is Omit<GatewayClaimCandidateMessage, 'type'> => Boolean(
          candidate
          && candidate.matchId === value.matchId
          && typeof candidate.candidateId === 'string'
          && candidate.candidateId.length > 0
          && Number.isInteger(candidate.throughSequence)
          && candidate.throughSequence > 0
        ))
        .slice(-64)
        .map(candidate => structuredClone(candidate));
      this.persistPendingTransport();
    } catch {
      // The live connection remains usable when session storage is unavailable or corrupt.
    }
  }

  private persistPendingTransport(): void {
    const key = this.pendingTransportStorageKey();
    if (!key) return;
    const matchId = this.pendingTransportMatchId();
    if (!matchId) {
      this.removePendingTransport();
      return;
    }
    const snapshot: GatewayPendingTransportSnapshot = {
      version: 1,
      matchId,
      telemetryQueue: this.telemetryQueue
        .filter(envelope => envelope.matchId === matchId)
        .slice(-512)
        .map(envelope => structuredClone(envelope)),
      telemetryInFlight: this.telemetryInFlight
        .filter(envelope => envelope.matchId === matchId)
        .slice(-64)
        .map(envelope => structuredClone(envelope)),
      pendingClaims: this.pendingClaims
        .filter(candidate => candidate.matchId === matchId)
        .slice(-64)
        .map(candidate => structuredClone(candidate))
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // Persistence is a reload safety net; the in-memory transport still works without it.
    }
  }

  private removePendingTransport(): void {
    const key = this.pendingTransportStorageKey();
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage cleanup is best-effort only.
    }
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
