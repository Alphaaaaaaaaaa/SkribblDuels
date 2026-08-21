import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_SOCKET_EVENT,
  isGatewayClientMessage,
  type GatewayClientCapability,
  type GatewayErrorMessage,
  type GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import {
  CONNECTION_MESSAGE_RATE_LIMIT,
  HANDSHAKE_RATE_LIMIT,
  InMemoryGatewayRateLimiter,
  RedisGatewayRateLimiter,
  policyForMessage,
  requestIdForMessage,
  type GatewayRateLimiter
} from './abuseControls';
import {
  GatewayAuthorityController,
  type GatewayAuthorityPayload
} from './authorityController';
import type { GatewayServerConfig } from './config';
import type {
  AuthenticatedGatewayAccount,
  GatewayAccessAuthenticator
} from './authenticate';
import type {
  GatewayAccountSanctions,
  GatewayAbuseSignal,
  GatewayMatchAuthorityPersistence
} from './matchPersistence';
import { GatewayMetrics } from './metrics';
import type { GatewayRealtimeInfrastructure } from './realtimeInfrastructure';

interface ClientToServerEvents {
  'gateway:message': (message: unknown) => void;
}

interface ServerToClientEvents {
  'gateway:message': (message: GatewayServerMessage) => void;
}

interface GatewaySocketData {
  account: AuthenticatedGatewayAccount;
  sanctions: GatewayAccountSanctions;
  helloAccepted: boolean;
  clientVersion: string | null;
  capabilities: readonly GatewayClientCapability[];
}

export interface CreateGatewayServerOptions {
  config: GatewayServerConfig;
  authenticate: GatewayAccessAuthenticator;
  persistence?: GatewayMatchAuthorityPersistence;
  realtime?: GatewayRealtimeInfrastructure;
  rateLimiter?: GatewayRateLimiter;
}

export interface GatewayServerInstance {
  httpServer: HttpServer;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

const NO_SANCTIONS: GatewayAccountSanctions = {
  fullBanUntil: null,
  matchmakingBanUntil: null,
  chatMuteUntil: null,
  telemetryBlockUntil: null
};

function connectionError(message: GatewayServerMessage): Error & { data: GatewayServerMessage } {
  const error = new Error(message.type === 'ERROR' ? message.message : 'Gateway authentication required.') as Error & {
    data: GatewayServerMessage;
  };
  error.data = message;
  return error;
}

function contractError(
  code: string,
  message: string,
  recoverable = false,
  requestId?: string
): GatewayErrorMessage {
  return { type: 'ERROR', code, message, recoverable, ...(requestId ? { requestId } : {}) };
}

function accountRoom(accountId: string): string {
  return `skd:account:${accountId}`;
}

function connectionRoom(connectionId: string): string {
  return `skd:connection:${connectionId}`;
}

function requestAddress(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return firstForwarded?.trim() || request.socket.remoteAddress || 'unknown';
}

function authorizedOperationsRequest(request: IncomingMessage, token: string | null): boolean {
  if (!token) return true;
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sanctionForMessage(
  sanctions: GatewayAccountSanctions,
  type: string,
  now: number
): { code: string; message: string } | null {
  if ((sanctions.fullBanUntil ?? 0) > now) {
    return { code: 'ACCOUNT_RESTRICTED', message: 'This account is temporarily restricted from Skribbl Duels.' };
  }
  if ((type === 'MATCHMAKING_JOIN' || type.startsWith('INVITE_'))
      && (sanctions.matchmakingBanUntil ?? 0) > now) {
    return { code: 'MATCHMAKING_RESTRICTED', message: 'Matchmaking is temporarily restricted for this account.' };
  }
  if (type === 'DUEL_CHAT_SEND' && (sanctions.chatMuteUntil ?? 0) > now) {
    return { code: 'DUEL_CHAT_MUTED', message: 'Duel Chat is temporarily muted for this account.' };
  }
  if ((type === 'TELEMETRY_BATCH' || type === 'CLAIM_CANDIDATE')
      && (sanctions.telemetryBlockUntil ?? 0) > now) {
    return { code: 'DUEL_TELEMETRY_RESTRICTED', message: 'Duel telemetry is temporarily restricted for this account.' };
  }
  return null;
}

export function createGatewayServer(options: CreateGatewayServerOptions): GatewayServerInstance {
  const { config, authenticate } = options;
  const metrics = new GatewayMetrics();
  const realtime = options.realtime;
  const rateLimiter = options.rateLimiter
    ?? (realtime
      ? new RedisGatewayRateLimiter(realtime.rateLimitClient())
      : new InMemoryGatewayRateLimiter());
  let shuttingDown = false;
  let started = false;

  const log = (event: string, details: Record<string, unknown>): void => {
    console.info(JSON.stringify({
      service: 'skribbl-duels-gateway',
      event,
      instanceId: config.instanceId,
      occurredAt: new Date().toISOString(),
      ...details
    }));
  };

  let io: Server<ClientToServerEvents, ServerToClientEvents, object, GatewaySocketData>;
  const authority = new GatewayAuthorityController({
    config,
    ...(options.persistence ? { persistence: options.persistence } : {}),
    metrics,
    sendToAccount(accountId, message) {
      io.to(accountRoom(accountId)).emit(GATEWAY_SOCKET_EVENT, message);
    },
    sendToConnection(connectionId, message) {
      if (!connectionId) return;
      io.to(connectionRoom(connectionId)).emit(GATEWAY_SOCKET_EVENT, message);
    },
    log
  });

  const realtimeStatus = () => realtime?.status() ?? {
    enabled: false,
    healthy: true,
    mode: 'single-instance' as const,
    instanceId: config.instanceId,
    authorityRole: 'leader' as const,
    leaderInstanceId: config.instanceId,
    error: null
  };

  const readiness = async (): Promise<Record<string, unknown> & { ready: boolean }> => {
    let supabaseHealthy = true;
    let supabaseError: string | null = null;
    if (options.persistence?.checkHealth) {
      try {
        await options.persistence.checkHealth();
      } catch (error) {
        supabaseHealthy = false;
        supabaseError = error instanceof Error ? error.message : String(error);
      }
    }
    const adapterHealthy = realtime ? await realtime.ping() : true;
    const realtimeState = realtimeStatus();
    const authorityState = authority.status();
    const ready = !shuttingDown
      && supabaseHealthy
      && adapterHealthy
      && realtimeState.healthy
      && authorityState.healthy;
    metrics.gauge('skribbl_duels_gateway_ready', ready ? 1 : 0);
    metrics.gauge('skribbl_duels_gateway_realtime_healthy', realtimeState.healthy ? 1 : 0);
    metrics.gauge('skribbl_duels_gateway_match_authority_active', authorityState.active ? 1 : 0);
    return {
      ready,
      supabase: {
        enabled: Boolean(options.persistence),
        healthy: supabaseHealthy,
        error: supabaseError
      },
      realtime: realtimeState,
      matchAuthority: authorityState
    };
  };

  const httpServer = createServer((request, response) => {
    const requestId = request.headers['x-request-id']?.toString().slice(0, 160) || randomUUID();
    void (async () => {
      response.setHeader('x-request-id', requestId);
      if (request.method === 'GET' && request.url === '/healthz') {
        response.writeHead(shuttingDown ? 503 : 200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          status: shuttingDown ? 'stopping' : 'ok',
          service: 'skribbl-duels-gateway',
          contractVersion: GATEWAY_CONTRACT_VERSION,
          instanceId: config.instanceId
        }));
        return;
      }
      if (request.method === 'GET' && request.url === '/readyz') {
        const status = await readiness();
        const supabase = status.supabase as { enabled: boolean; healthy: boolean };
        const realtimeState = status.realtime as ReturnType<typeof realtimeStatus>;
        const matchAuthority = status.matchAuthority as ReturnType<typeof authority.status>;
        response.writeHead(status.ready ? 200 : 503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          status: status.ready ? 'ready' : 'degraded',
          service: 'skribbl-duels-gateway',
          contractVersion: GATEWAY_CONTRACT_VERSION,
          ready: status.ready,
          supabase: { enabled: supabase.enabled, healthy: supabase.healthy },
          realtime: {
            enabled: realtimeState.enabled,
            healthy: realtimeState.healthy,
            mode: realtimeState.mode,
            authorityRole: realtimeState.authorityRole
          },
          matchAuthority: {
            active: matchAuthority.active,
            healthy: matchAuthority.healthy
          }
        }));
        return;
      }
      if (request.method === 'GET' && (request.url === '/metrics' || request.url === '/diagnostics')) {
        if (!authorizedOperationsRequest(request, config.observabilityToken)) {
          response.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'operations-auth-required', requestId }));
          return;
        }
        if (request.url === '/metrics') {
          response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
          response.end(metrics.prometheus());
          return;
        }
        const status = await readiness();
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end(JSON.stringify({
          generatedAt: new Date().toISOString(),
          service: 'skribbl-duels-gateway',
          contractVersion: GATEWAY_CONTRACT_VERSION,
          instanceId: config.instanceId,
          status,
          metrics: metrics.snapshot()
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'not-found', requestId }));
    })().catch(error => {
      log('http-request-error', { requestId, error: error instanceof Error ? error.message : String(error) });
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'internal-error', requestId }));
    });
  });

  io = new Server<ClientToServerEvents, ServerToClientEvents, object, GatewaySocketData>(httpServer, {
    ...(realtime ? { adapter: realtime.adapter() } : {}),
    cors: {
      origin: config.clientOrigin,
      methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 300_000,
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, origin === undefined || origin === config.clientOrigin);
    }
  });

  const dispatch = async (payload: GatewayAuthorityPayload): Promise<boolean> => {
    if (realtime) return realtime.submit(payload);
    await authority.handle({ commandId: randomUUID(), sentAt: Date.now(), payload });
    return true;
  };

  const recordAbuseSignal = (signal: GatewayAbuseSignal): void => {
    void options.persistence?.recordAbuseSignal?.(signal).catch(error => {
      log('abuse-signal-persistence-error', { error: error instanceof Error ? error.message : String(error) });
    });
  };

  io.use(async (socket, next) => {
    try {
      const handshakeLimit = await rateLimiter.consume(HANDSHAKE_RATE_LIMIT, requestAddress(socket.request));
      if (!handshakeLimit.allowed) {
        metrics.increment('skribbl_duels_gateway_rate_limited_total', { scope: 'handshake' });
        next(connectionError(contractError(
          'CONNECTION_RATE_LIMITED',
          `Too many Gateway connection attempts. Try again in ${Math.ceil(handshakeLimit.retryAfterMs / 1_000)} seconds.`,
          true
        )));
        return;
      }
      const decision = await authenticate(socket.handshake.auth?.accessToken);
      if (!decision.ok) {
        metrics.increment('skribbl_duels_gateway_connections_total', { outcome: 'auth-rejected' });
        next(connectionError(decision.message));
        return;
      }
      const sanctions = options.persistence?.getActiveSanctions
        ? await options.persistence.getActiveSanctions(decision.account.identity.accountId, Date.now())
        : NO_SANCTIONS;
      if ((sanctions.fullBanUntil ?? 0) > Date.now()) {
        metrics.increment('skribbl_duels_gateway_connections_total', { outcome: 'sanctioned' });
        next(connectionError(contractError(
          'ACCOUNT_RESTRICTED',
          'This account is temporarily restricted from Skribbl Duels.',
          false
        )));
        return;
      }
      socket.data.account = decision.account;
      socket.data.sanctions = sanctions;
      socket.data.helloAccepted = false;
      socket.data.clientVersion = null;
      socket.data.capabilities = [];
      next();
    } catch (error) {
      log('connection-middleware-error', { error: error instanceof Error ? error.message : String(error) });
      next(connectionError(contractError(
        'AUTH_BACKEND_UNAVAILABLE',
        'Gateway authentication is temporarily unavailable.',
        true
      )));
    }
  });

  io.on('connection', socket => {
    metrics.increment('skribbl_duels_gateway_connections_total', { outcome: 'accepted' });
    metrics.gauge('skribbl_duels_gateway_socket_connections', io.engine.clientsCount);
    const expiresAt = socket.data.account.accessTokenExpiresAt;
    const expiryTimer = expiresAt === null
      ? null
      : setTimeout(() => {
          socket.emit(GATEWAY_SOCKET_EVENT, { type: 'AUTH_REQUIRED', reason: 'expired-token' });
          socket.disconnect(true);
        }, Math.max(1, expiresAt - Date.now()));
    expiryTimer?.unref();

    const helloTimer = setTimeout(() => {
      if (socket.data.helloAccepted) return;
      socket.emit(GATEWAY_SOCKET_EVENT, contractError('HELLO_TIMEOUT', 'Gateway HELLO was not received in time.'));
      socket.disconnect(true);
    }, config.helloTimeoutMs);
    helloTimer.unref();

    let incoming = Promise.resolve();
    socket.on(GATEWAY_SOCKET_EVENT, value => {
      incoming = incoming.then(async () => {
        const receivedAt = Date.now();
        const connectionLimit = await rateLimiter.consume(CONNECTION_MESSAGE_RATE_LIMIT, socket.id);
        if (!connectionLimit.allowed) {
          metrics.increment('skribbl_duels_gateway_rate_limited_total', { scope: 'connection' });
          socket.emit(GATEWAY_SOCKET_EVENT, contractError(
            'CONNECTION_MESSAGE_RATE_LIMITED',
            `Too many Gateway messages. Try again in ${Math.ceil(connectionLimit.retryAfterMs / 1_000)} seconds.`,
            true
          ));
          return;
        }
        if (!isGatewayClientMessage(value)) {
          const raw = value as { type?: unknown; contractVersion?: unknown } | null;
          const mismatch = raw?.type === 'HELLO' && raw.contractVersion !== GATEWAY_CONTRACT_VERSION;
          const correlationId = randomUUID();
          metrics.increment('skribbl_duels_gateway_invalid_messages_total', {
            reason: mismatch ? 'contract-version' : 'schema'
          });
          recordAbuseSignal({
            accountId: socket.data.account.identity.accountId,
            connectionId: socket.id,
            matchId: null,
            category: 'invalid-message',
            severity: 'warning',
            reason: mismatch ? 'contract-version-unsupported' : 'schema-validation-failed',
            correlationId,
            occurredAt: receivedAt
          });
          socket.emit(GATEWAY_SOCKET_EVENT, mismatch
            ? contractError('CONTRACT_VERSION_UNSUPPORTED', `Gateway Contract v${GATEWAY_CONTRACT_VERSION} is required.`)
            : contractError('INVALID_MESSAGE', `Gateway message failed Contract v${GATEWAY_CONTRACT_VERSION} validation.`));
          socket.disconnect(true);
          return;
        }
        const message = value;
        metrics.observeInbound(message, receivedAt);
        if (!socket.data.helloAccepted) {
          if (message.type !== 'HELLO') {
            socket.emit(GATEWAY_SOCKET_EVENT, contractError('HELLO_REQUIRED', 'HELLO must be the first Gateway message.'));
            socket.disconnect(true);
            return;
          }
          clearTimeout(helloTimer);
          socket.data.helloAccepted = true;
          socket.data.clientVersion = message.clientVersion;
          socket.data.capabilities = [...message.capabilities];
          const accountId = socket.data.account.identity.accountId;
          io.in(accountRoom(accountId)).disconnectSockets(true);
          await socket.join(accountRoom(accountId));
          await socket.join(connectionRoom(socket.id));
          const accepted = await dispatch({
            kind: 'connect',
            identity: socket.data.account.identity,
            capabilities: [...socket.data.capabilities],
            connectionId: socket.id,
            clientVersion: message.clientVersion,
            ...(message.resumeMatchId ? { resumeMatchId: message.resumeMatchId } : {})
          });
          if (!accepted) {
            socket.emit(GATEWAY_SOCKET_EVENT, contractError(
              'REALTIME_AUTHORITY_UNAVAILABLE',
              'The shared Match Authority is temporarily unavailable. Please reconnect.',
              true
            ));
            socket.disconnect(true);
          }
          return;
        }
        if (message.type === 'PING') {
          socket.emit(GATEWAY_SOCKET_EVENT, {
            type: 'PONG',
            clientSentAt: message.sentAt,
            serverTime: Date.now()
          });
          return;
        }
        if (message.type === 'HELLO') {
          socket.emit(GATEWAY_SOCKET_EVENT, contractError('HELLO_ALREADY_ACCEPTED', 'HELLO may only be sent once.'));
          return;
        }
        const sanction = sanctionForMessage(socket.data.sanctions, message.type, receivedAt);
        if (sanction) {
          socket.emit(GATEWAY_SOCKET_EVENT, contractError(
            sanction.code,
            sanction.message,
            false,
            requestIdForMessage(message)
          ));
          return;
        }
        const policy = policyForMessage(message);
        if (policy) {
          const accountLimit = await rateLimiter.consume(policy, socket.data.account.identity.accountId);
          if (!accountLimit.allowed) {
            const correlationId = randomUUID();
            metrics.increment('skribbl_duels_gateway_rate_limited_total', { scope: policy.scope });
            recordAbuseSignal({
              accountId: socket.data.account.identity.accountId,
              connectionId: socket.id,
              matchId: 'matchId' in message && typeof message.matchId === 'string' ? message.matchId : null,
              category: 'rate-limit',
              severity: 'info',
              reason: `${policy.scope}-rate-limit`,
              correlationId,
              occurredAt: receivedAt
            });
            log('gateway-command-rate-limited', {
              correlationId,
              commandType: message.type,
              scope: policy.scope
            });
            socket.emit(GATEWAY_SOCKET_EVENT, contractError(
              'COMMAND_RATE_LIMITED',
              `Too many ${policy.scope} actions. Try again in ${Math.ceil(accountLimit.retryAfterMs / 1_000)} seconds.`,
              true,
              requestIdForMessage(message)
            ));
            return;
          }
        }
        const accepted = await dispatch({
          kind: 'message',
          accountId: socket.data.account.identity.accountId,
          connectionId: socket.id,
          message
        });
        if (!accepted) {
          socket.emit(GATEWAY_SOCKET_EVENT, contractError(
            'REALTIME_AUTHORITY_UNAVAILABLE',
            'The shared Match Authority is temporarily unavailable. Please retry.',
            true,
            requestIdForMessage(message)
          ));
        }
      }).catch(error => {
        const correlationId = randomUUID();
        log('gateway-message-error', {
          correlationId,
          error: error instanceof Error ? error.message : String(error)
        });
        socket.emit(GATEWAY_SOCKET_EVENT, contractError(
          'GATEWAY_COMMAND_FAILED',
          'The Gateway could not process this command. Please retry.',
          true
        ));
      });
    });

    socket.once('disconnect', reason => {
      clearTimeout(helloTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      metrics.increment('skribbl_duels_gateway_transport_disconnects_total', { reason });
      metrics.gauge('skribbl_duels_gateway_socket_connections', Math.max(0, io.engine.clientsCount));
      if (socket.data.helloAccepted) {
        void dispatch({
          kind: 'disconnect',
          accountId: socket.data.account.identity.accountId,
          connectionId: socket.id
        });
      }
    });
  });

  io.engine.on('connection_error', error => {
    metrics.increment('skribbl_duels_gateway_transport_errors_total', {
      code: String(error.code ?? 'unknown')
    });
  });

  return {
    httpServer,
    async listen(port = config.port, host = '0.0.0.0') {
      if (!started) {
        started = true;
        if (realtime) {
          await realtime.start(async leader => {
            await authority.setActive(leader);
            if (leader) io.disconnectSockets(true);
          }, command => authority.handle(command));
        } else {
          await authority.setActive(true);
        }
      }
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
      if (shuttingDown) return;
      shuttingDown = true;
      await new Promise<void>(resolve => io.close(() => resolve()));
      await authority.close();
      await realtime?.close();
    }
  };
}
