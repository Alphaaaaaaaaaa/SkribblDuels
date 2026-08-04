import { io, type Socket } from 'socket.io-client';
import {
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_SOCKET_EVENT,
  isGatewayConnectErrorData,
  isGatewayServerMessage,
  type GatewayClientMessage,
  type GatewayMatchmakingJoinMessage,
  type GatewayServerMessage,
  type GatewaySocketAuth
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

  public constructor(private readonly options: SocketIoGatewayClientOptions) {
    this.state = initialSnapshot(options.endpoint);
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
    this.update({ ...this.state, queue: null, match: null, lastMatchEvent: null, error: null });
    return requestId;
  }

  public leaveMatchmaking(): string {
    const requestId = this.createRequestId('leave');
    this.emit({ type: 'MATCHMAKING_LEAVE', requestId });
    return requestId;
  }

  public setReady(matchId: string, ready: boolean): void {
    this.emit({ type: 'READY_SET', matchId, ready });
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
      timeout: 10_000
    });
    this.socket = socket;
    this.update({
      ...initialSnapshot(endpoint),
      status: 'connecting'
    });

    socket.on('connect', () => {
      const hello: GatewayClientMessage = {
        type: 'HELLO',
        contractVersion: GATEWAY_CONTRACT_VERSION,
        clientVersion: this.options.clientVersion,
        capabilities: this.options.capabilities
      };
      socket.emit(GATEWAY_SOCKET_EVENT, hello);
    });
    socket.on(GATEWAY_SOCKET_EVENT, message => this.receive(message));
    socket.on('connect_error', rawError => {
      const error = rawError as Error & { data?: unknown };
      this.update({
        ...initialSnapshot(endpoint),
        status: 'error',
        error: errorMessage(error)
      });
    });
    socket.on('disconnect', reason => {
      if (!this.accessToken || this.socket !== socket) return;
      this.update({
        ...initialSnapshot(endpoint),
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
        error: 'Gateway sent an invalid Contract v1 message.'
      });
      return;
    }
    if (value.type === 'WELCOME') {
      this.update({
        status: 'connected',
        endpoint: this.options.endpoint,
        connectionId: value.connectionId,
        identity: value.identity,
        connectedAt: Date.now(),
        serverTimeOffsetMs: value.serverTime - Date.now(),
        queue: null,
        match: null,
        lastMatchEvent: null,
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
      this.update({
        ...this.state,
        queue: null,
        match: structuredClone(value),
        error: null
      });
      return;
    }
    if (value.type === 'MATCH_EVENT') {
      if (this.state.lastMatchEvent?.matchId === value.matchId &&
          this.state.lastMatchEvent.revision > value.revision) return;
      this.update({ ...this.state, lastMatchEvent: structuredClone(value), error: null });
    }
  }

  private emit(message: GatewayClientMessage): void {
    if (this.state.status !== 'connected' || !this.socket?.connected) {
      throw new Error('The authenticated Gateway must be connected before matchmaking.');
    }
    this.socket.emit(GATEWAY_SOCKET_EVENT, message);
  }

  private createRequestId(prefix: string): string {
    const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  private disconnectSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
  }

  private update(state: GatewayConnectionSnapshot): void {
    this.state = structuredClone(state);
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
