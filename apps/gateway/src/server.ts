import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_SOCKET_EVENT,
  isGatewayClientMessage,
  type GatewayClientMessage,
  type GatewayClientCapability,
  type GatewayErrorMessage,
  type GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import type { GatewayServerConfig } from './config';
import type {
  AuthenticatedGatewayAccount,
  GatewayAccessAuthenticator
} from './authenticate';
import { GatewayMatchmaker } from './matchmaking';
import type { GatewayMatchAuthorityPersistence } from './matchPersistence';

interface ClientToServerEvents {
  'gateway:message': (message: unknown) => void;
}

interface ServerToClientEvents {
  'gateway:message': (message: GatewayServerMessage) => void;
}

interface GatewaySocketData {
  account: AuthenticatedGatewayAccount;
  helloAccepted: boolean;
  clientVersion: string | null;
  capabilities: readonly GatewayClientCapability[];
}

export interface CreateGatewayServerOptions {
  config: GatewayServerConfig;
  authenticate: GatewayAccessAuthenticator;
  persistence?: GatewayMatchAuthorityPersistence;
}

export interface GatewayServerInstance {
  httpServer: HttpServer;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

function connectionError(message: GatewayServerMessage): Error & { data: GatewayServerMessage } {
  const error = new Error(message.type === 'ERROR' ? message.message : 'Gateway authentication required.') as Error & {
    data: GatewayServerMessage;
  };
  error.data = message;
  return error;
}

function contractError(code: string, message: string, recoverable = false): GatewayErrorMessage {
  return { type: 'ERROR', code, message, recoverable };
}

function emitMessage(
  socket: Parameters<Parameters<Server<ClientToServerEvents, ServerToClientEvents, object, GatewaySocketData>['on']>[1]>[0],
  message: GatewayServerMessage
): void {
  socket.emit(GATEWAY_SOCKET_EVENT, message);
}

export function createGatewayServer(options: CreateGatewayServerOptions): GatewayServerInstance {
  const { config, authenticate } = options;
  const matchmaker = new GatewayMatchmaker({
    readyTimeoutMs: config.matchmakingReadyTimeoutMs,
    simulatedPlayersEnabled: config.simulatedPlayersEnabled,
    simulatedMatchDelayMs: config.simulatedMatchDelayMs,
    simulatedReadyDelayMs: config.simulatedReadyDelayMs,
    draftPickTimeoutMs: config.draftPickTimeoutMs,
    simulatedDraftPickDelayMs: config.simulatedDraftPickDelayMs,
    draftFinalRevealMs: config.draftFinalRevealMs,
    matchCountdownMs: config.matchCountdownMs,
    reconnectGraceMs: config.reconnectGraceMs,
    drawProposalTimeoutMs: config.drawProposalTimeoutMs,
    ...(options.persistence ? { persistence: options.persistence } : {}),
    onPersistenceError(error) {
      console.error('[Skribbl Duels Gateway] Durable authority persistence failed.', error);
    }
  });
  const restorePromise = matchmaker.restoreFromPersistence();
  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      const matchAuthority = matchmaker.persistenceStatus();
      const healthy = !matchAuthority.enabled || matchAuthority.healthy;
      response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        status: healthy ? 'ok' : 'degraded',
        service: 'skribbl-duels-gateway',
        contractVersion: GATEWAY_CONTRACT_VERSION,
        matchAuthority
      }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not-found' }));
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, GatewaySocketData>(httpServer, {
    cors: {
      origin: config.clientOrigin,
      methods: ['GET', 'POST']
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, origin === undefined || origin === config.clientOrigin);
    }
  });
  const activeConnections = new Map<string, string>();
  io.use(async (socket, next) => {
    try {
      const decision = await authenticate(socket.handshake.auth?.accessToken);
      if (!decision.ok) {
        next(connectionError(decision.message));
        return;
      }
      socket.data.account = decision.account;
      socket.data.helloAccepted = false;
      socket.data.clientVersion = null;
      socket.data.capabilities = [];
      next();
    } catch {
      next(connectionError(contractError(
        'AUTH_BACKEND_UNAVAILABLE',
        'Gateway authentication is temporarily unavailable.',
        true
      )));
    }
  });

  io.on('connection', socket => {
    const expiresAt = socket.data.account.accessTokenExpiresAt;
    const expiryTimer = expiresAt === null
      ? null
      : setTimeout(() => {
          emitMessage(socket, { type: 'AUTH_REQUIRED', reason: 'expired-token' });
          socket.disconnect(true);
        }, Math.max(1, expiresAt - Date.now()));
    expiryTimer?.unref();

    const helloTimer = setTimeout(() => {
      if (socket.data.helloAccepted) return;
      emitMessage(socket, contractError('HELLO_TIMEOUT', 'Gateway HELLO was not received in time.'));
      socket.disconnect(true);
    }, config.helloTimeoutMs);
    helloTimer.unref();

    socket.on(GATEWAY_SOCKET_EVENT, (value: unknown) => {
      if (!isGatewayClientMessage(value)) {
        const raw = value as { type?: unknown; contractVersion?: unknown } | null;
        const mismatch = raw?.type === 'HELLO'
          && raw.contractVersion !== GATEWAY_CONTRACT_VERSION;
        emitMessage(socket, mismatch
          ? contractError(
              'CONTRACT_VERSION_UNSUPPORTED',
              `Gateway Contract v${GATEWAY_CONTRACT_VERSION} is required.`
            )
          : contractError('INVALID_MESSAGE', `Gateway message failed Contract v${GATEWAY_CONTRACT_VERSION} validation.`));
        socket.disconnect(true);
        return;
      }
      const message: GatewayClientMessage = value;
      if (!socket.data.helloAccepted) {
        if (message.type !== 'HELLO') {
          emitMessage(socket, contractError('HELLO_REQUIRED', 'HELLO must be the first Gateway message.'));
          socket.disconnect(true);
          return;
        }
        clearTimeout(helloTimer);
        socket.data.helloAccepted = true;
        socket.data.clientVersion = message.clientVersion;
        socket.data.capabilities = [...message.capabilities];
        const accountId = socket.data.account.identity.accountId;
        const previousSocketId = activeConnections.get(accountId);
        activeConnections.set(accountId, socket.id);
        if (previousSocketId && previousSocketId !== socket.id) {
          io.sockets.sockets.get(previousSocketId)?.disconnect(true);
        }
        const resume = matchmaker.resume({
          identity: socket.data.account.identity,
          capabilities: socket.data.capabilities,
          send: outgoing => emitMessage(socket, outgoing)
        }, message.resumeMatchId);
        emitMessage(socket, {
          type: 'WELCOME',
          contractVersion: GATEWAY_CONTRACT_VERSION,
          connectionId: socket.id,
          identity: socket.data.account.identity,
          serverTime: Date.now(),
          heartbeatIntervalMs: config.heartbeatIntervalMs,
          resumeStatus: resume.status,
          resumedMatchId: resume.matchId
        });
        if (resume.status === 'resumed') matchmaker.publishResumeSnapshot(accountId);
        return;
      }

      if (message.type === 'PING') {
        emitMessage(socket, {
          type: 'PONG',
          clientSentAt: message.sentAt,
          serverTime: Date.now()
        });
        return;
      }
      if (message.type === 'MATCHMAKING_JOIN') {
        matchmaker.join({
          identity: socket.data.account.identity,
          capabilities: socket.data.capabilities,
          send: outgoing => emitMessage(socket, outgoing)
        }, message);
        return;
      }
      if (message.type === 'MATCHMAKING_LEAVE') {
        matchmaker.leave(socket.data.account.identity.accountId, message.requestId);
        return;
      }
      if (message.type === 'READY_SET') {
        const decision = matchmaker.setReady(socket.data.account.identity.accountId, message);
        if (!decision.ok) {
          emitMessage(socket, contractError(decision.code, decision.message, true));
        }
        return;
      }
      if (message.type === 'DRAFT_PICK') {
        const decision = matchmaker.pickDraftChallenge(socket.data.account.identity.accountId, message);
        if (!decision.ok) {
          emitMessage(socket, contractError(decision.code, decision.message, true));
        }
        return;
      }
      if (message.type === 'DUEL_CHAT_SEND') {
        const decision = matchmaker.sendDuelChat(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'MATCH_FORFEIT') {
        const decision = matchmaker.forfeitMatch(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'MATCH_REMATCH') {
        const decision = matchmaker.requestRematch(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'DRAW_PROPOSE') {
        const decision = matchmaker.proposeDraw(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'DRAW_RESPOND') {
        const decision = matchmaker.respondToDraw(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'DRAW_WITHDRAW') {
        const decision = matchmaker.withdrawDraw(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'TELEMETRY_BATCH') {
        const decision = matchmaker.processTelemetryBatch(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'CLAIM_CANDIDATE') {
        const decision = matchmaker.submitClaimCandidate(socket.data.account.identity.accountId, message);
        if (!decision.ok) emitMessage(socket, contractError(decision.code, decision.message, true));
        return;
      }
      if (message.type === 'HELLO') {
        emitMessage(socket, contractError('HELLO_ALREADY_ACCEPTED', 'HELLO may only be sent once.'));
        return;
      }
    });

    socket.once('disconnect', () => {
      clearTimeout(helloTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      const accountId = socket.data.account.identity.accountId;
      if (activeConnections.get(accountId) === socket.id) {
        activeConnections.delete(accountId);
        matchmaker.disconnect(accountId);
      }
    });
  });

  return {
    httpServer,
    async listen(port = config.port, host = '0.0.0.0') {
      await restorePromise;
      return new Promise<number>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        httpServer.once('error', onError);
        httpServer.listen(port, host, () => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    async close() {
      await matchmaker.close();
      await new Promise<void>(resolve => {
        io.close(() => resolve());
      });
    }
  };
}
