import {
  GATEWAY_CONTRACT_VERSION,
  type GatewayClientCapability,
  type GatewayClientIdentity,
  type GatewayClientMessage,
  type GatewayErrorMessage,
  type GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import type { GatewayServerConfig } from './config';
import { GatewayMatchmaker, type MatchmakingPeer, type ReadyDecision } from './matchmaking';
import type { GatewayMatchAuthorityPersistence } from './matchPersistence';
import type { GatewayMetrics } from './metrics';
import type { GatewayRealtimeCommand } from './realtimeInfrastructure';

interface AuthorityPeerPayload {
  identity: GatewayClientIdentity;
  capabilities: GatewayClientCapability[];
  connectionId: string;
  connectionEpoch: number;
}

export type GatewayAuthorityPayload =
  | ({ kind: 'connect'; clientVersion: string; resumeMatchId?: string } & AuthorityPeerPayload)
  | { kind: 'disconnect'; accountId: string; connectionId: string; connectionEpoch: number }
  | {
      kind: 'message';
      accountId: string;
      connectionId: string;
      connectionEpoch: number;
      message: GatewayClientMessage;
    };

interface ActiveAuthorityConnection {
  connectionId: string;
  connectionEpoch: number;
  peer: MatchmakingPeer;
}

interface GatewayAuthorityControllerOptions {
  config: GatewayServerConfig;
  persistence?: GatewayMatchAuthorityPersistence;
  metrics: GatewayMetrics;
  sendToAccount(accountId: string, message: GatewayServerMessage): void;
  sendToConnection(connectionId: string, message: GatewayServerMessage): void;
  log(event: string, details: Record<string, unknown>): void;
}

function errorMessage(code: string, message: string, recoverable = true, requestId?: string): GatewayErrorMessage {
  return { type: 'ERROR', code, message, recoverable, ...(requestId ? { requestId } : {}) };
}

function requestId(message: GatewayClientMessage): string | undefined {
  if ('requestId' in message && typeof message.requestId === 'string') return message.requestId;
  if ('actionId' in message && typeof message.actionId === 'string') return message.actionId;
  if ('clientMessageId' in message && typeof message.clientMessageId === 'string') return message.clientMessageId;
  if ('candidateId' in message && typeof message.candidateId === 'string') return message.candidateId;
  return undefined;
}

function payload(value: unknown): GatewayAuthorityPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<GatewayAuthorityPayload>;
  if (candidate.kind === 'disconnect') {
    return typeof candidate.accountId === 'string'
      && typeof candidate.connectionId === 'string'
      && Number.isSafeInteger(candidate.connectionEpoch)
      && (candidate.connectionEpoch ?? 0) > 0
      ? candidate as GatewayAuthorityPayload
      : null;
  }
  if (candidate.kind === 'message') {
    return typeof candidate.accountId === 'string'
      && typeof candidate.connectionId === 'string'
      && Number.isSafeInteger(candidate.connectionEpoch)
      && (candidate.connectionEpoch ?? 0) > 0
      && typeof candidate.message === 'object'
      ? candidate as GatewayAuthorityPayload
      : null;
  }
  if (candidate.kind === 'connect') {
    const peer = candidate as Partial<AuthorityPeerPayload>;
    return typeof peer.connectionId === 'string'
      && Number.isSafeInteger(peer.connectionEpoch)
      && (peer.connectionEpoch ?? 0) > 0
      && typeof peer.identity === 'object'
      && peer.identity !== null
      && Array.isArray(peer.capabilities)
      && typeof candidate.clientVersion === 'string'
      ? candidate as GatewayAuthorityPayload
      : null;
  }
  return null;
}

export class GatewayAuthorityController {
  private matchmaker: GatewayMatchmaker | null = null;
  private readonly connections = new Map<string, ActiveAuthorityConnection>();
  private readonly processedCommands = new Set<string>();
  private readonly queueJoinedAt = new Map<string, number>();
  private readonly recordedDisconnectMatches = new Set<string>();
  private activation: Promise<void> = Promise.resolve();
  private authorityError: Error | null = null;

  public constructor(private readonly options: GatewayAuthorityControllerOptions) {}

  public async setActive(active: boolean): Promise<void> {
    this.activation = this.activation.catch(() => {}).then(async () => {
      if (active && !this.matchmaker) {
        const matchmaker = this.createMatchmaker();
        try {
          await matchmaker.restoreFromPersistence();
          this.matchmaker = matchmaker;
          this.authorityError = null;
        } catch (error) {
          await matchmaker.close();
          this.authorityError = error instanceof Error ? error : new Error(String(error));
          throw this.authorityError;
        }
      } else if (!active && this.matchmaker) {
        const current = this.matchmaker;
        this.matchmaker = null;
        this.connections.clear();
        this.queueJoinedAt.clear();
        await current.close();
      }
    });
    await this.activation;
  }

  public async handle(command: GatewayRealtimeCommand): Promise<void> {
    if (!this.matchmaker || this.processedCommands.has(command.commandId)) return;
    const commandPayload = payload(command.payload);
    if (!commandPayload) return;
    this.processedCommands.add(command.commandId);
    while (this.processedCommands.size > 20_000) {
      const oldest = this.processedCommands.values().next().value as string | undefined;
      if (!oldest) break;
      this.processedCommands.delete(oldest);
    }

    if (commandPayload.kind === 'connect') {
      this.connect(commandPayload);
      return;
    }
    if (commandPayload.kind === 'disconnect') {
      const current = this.connections.get(commandPayload.accountId);
      if (current?.connectionId !== commandPayload.connectionId
          || current.connectionEpoch !== commandPayload.connectionEpoch) return;
      this.connections.delete(commandPayload.accountId);
      this.options.metrics.gauge('skribbl_duels_gateway_authority_connections', this.connections.size);
      this.matchmaker.disconnect(commandPayload.accountId);
      return;
    }
    const connection = this.connections.get(commandPayload.accountId);
    if (!connection
        || connection.connectionId !== commandPayload.connectionId
        || connection.connectionEpoch !== commandPayload.connectionEpoch) {
      this.options.sendToConnection(commandPayload.connectionId, errorMessage(
        'STALE_CONNECTION',
        'This Gateway connection has been superseded. Reconnect and try again.'
      ));
      return;
    }
    await this.processMessage(connection.peer, commandPayload.message, command.commandId);
  }

  public status(): { active: boolean; healthy: boolean; restoredMatches: number; error: string | null } {
    const persistence = this.matchmaker?.persistenceStatus();
    return {
      active: this.matchmaker !== null,
      healthy: this.authorityError === null && (!persistence || persistence.healthy),
      restoredMatches: persistence?.restoredMatches ?? 0,
      error: this.authorityError?.message ?? persistence?.error ?? null
    };
  }

  public async close(): Promise<void> {
    await this.setActive(false);
  }

  private createMatchmaker(): GatewayMatchmaker {
    const config = this.options.config;
    return new GatewayMatchmaker({
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
      inviteTimeoutMs: config.inviteTimeoutMs,
      ...(this.options.persistence ? { persistence: this.options.persistence } : {}),
      onPersistenceError: error => {
        this.authorityError = error;
        this.options.log('authority-persistence-error', { error: error.message });
      }
    });
  }

  private connect(command: Extract<GatewayAuthorityPayload, { kind: 'connect' }>): void {
    const matchmaker = this.matchmaker;
    if (!matchmaker) return;
    const accountId = command.identity.accountId;
    const current = this.connections.get(accountId);
    if (current && current.connectionEpoch >= command.connectionEpoch) {
      this.options.sendToConnection(command.connectionId, errorMessage(
        'STALE_CONNECTION',
        'This Gateway connection has been superseded. Reconnect and try again.'
      ));
      return;
    }
    const peer: MatchmakingPeer = {
      identity: command.identity,
      capabilities: command.capabilities,
      send: outgoing => this.sendAccount(accountId, outgoing)
    };
    this.connections.set(accountId, {
      connectionId: command.connectionId,
      connectionEpoch: command.connectionEpoch,
      peer
    });
    this.options.metrics.gauge('skribbl_duels_gateway_authority_connections', this.connections.size);
    const resume = matchmaker.resume(peer, command.resumeMatchId);
    this.options.metrics.increment('skribbl_duels_gateway_reconnects_total', { status: resume.status });
    this.options.sendToConnection(command.connectionId, {
      type: 'WELCOME',
      contractVersion: GATEWAY_CONTRACT_VERSION,
      connectionId: command.connectionId,
      identity: command.identity,
      serverTime: Date.now(),
      heartbeatIntervalMs: this.options.config.heartbeatIntervalMs,
      resumeStatus: resume.status,
      resumedMatchId: resume.matchId
    });
    if (resume.status === 'resumed') matchmaker.publishResumeSnapshot(accountId);
    else matchmaker.attachPeer(peer);
  }

  private sendAccount(accountId: string, message: GatewayServerMessage): void {
    this.options.metrics.observeOutbound(message);
    if (message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'ready-check') {
      const joinedAt = this.queueJoinedAt.get(accountId);
      if (joinedAt !== undefined) {
        this.options.metrics.observe(
          'skribbl_duels_gateway_queue_wait_seconds',
          Math.max(0, Date.now() - joinedAt) / 1_000,
          [0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
          { format: message.state.format }
        );
        this.queueJoinedAt.delete(accountId);
      }
    }
    if (message.type === 'MATCH_SNAPSHOT'
        && message.state.conclusion?.reason === 'player-disconnect'
        && !this.recordedDisconnectMatches.has(message.matchId)) {
      this.recordedDisconnectMatches.add(message.matchId);
      const loserAccountId = message.state.conclusion.loserAccountId;
      if (loserAccountId) {
        void this.options.persistence?.recordAbuseSignal?.({
          accountId: loserAccountId,
          connectionId: null,
          matchId: message.matchId,
          category: 'disconnect-abuse',
          severity: 'info',
          reason: 'player-reconnect-timeout',
          correlationId: `match:${message.matchId}:${message.revision}`,
          occurredAt: message.state.conclusion.occurredAt
        }).catch(error => this.options.log('abuse-signal-persistence-error', { error: String(error) }));
      }
    }
    this.options.sendToAccount(accountId, message);
  }

  private async processMessage(peer: MatchmakingPeer, message: GatewayClientMessage, correlationId: string): Promise<void> {
    const matchmaker = this.matchmaker;
    if (!matchmaker) return;
    const accountId = peer.identity.accountId;
    let decision: ReadyDecision | null = null;
    if (message.type === 'MATCHMAKING_JOIN') {
      this.queueJoinedAt.set(accountId, Date.now());
      matchmaker.join(peer, message);
    } else if (message.type === 'MATCHMAKING_LEAVE') {
      this.queueJoinedAt.delete(accountId);
      matchmaker.leave(accountId, message.requestId);
    } else if (message.type === 'INVITE_CREATE') {
      decision = await matchmaker.createInvite(peer, message);
    } else if (message.type === 'INVITE_ACCEPT') {
      decision = await matchmaker.acceptInvite(peer, message);
    } else if (message.type === 'INVITE_CANCEL') {
      decision = await matchmaker.cancelInvite(accountId, message);
    } else if (message.type === 'READY_SET') {
      decision = matchmaker.setReady(accountId, message);
    } else if (message.type === 'DRAFT_PICK') {
      decision = matchmaker.pickDraftChallenge(accountId, message);
    } else if (message.type === 'DUEL_CHAT_SEND') {
      decision = matchmaker.sendDuelChat(accountId, message);
    } else if (message.type === 'MATCH_FORFEIT') {
      decision = matchmaker.forfeitMatch(accountId, message);
    } else if (message.type === 'MATCH_REMATCH') {
      decision = matchmaker.requestRematch(accountId, message);
    } else if (message.type === 'DRAW_PROPOSE') {
      decision = matchmaker.proposeDraw(accountId, message);
    } else if (message.type === 'DRAW_RESPOND') {
      decision = matchmaker.respondToDraw(accountId, message);
    } else if (message.type === 'DRAW_WITHDRAW') {
      decision = matchmaker.withdrawDraw(accountId, message);
    } else if (message.type === 'TELEMETRY_BATCH') {
      decision = matchmaker.processTelemetryBatch(accountId, message);
    } else if (message.type === 'CLAIM_CANDIDATE') {
      decision = matchmaker.submitClaimCandidate(accountId, message);
    }
    if (!decision || decision.ok) return;
    this.options.sendToConnection(peer.identity.accountId === accountId
      ? this.connections.get(accountId)?.connectionId ?? ''
      : '', errorMessage(decision.code, decision.message, true, requestId(message)));
    this.options.log('authority-command-rejected', {
      correlationId,
      commandType: message.type,
      code: decision.code
    });
    if (message.type === 'TELEMETRY_BATCH'
        && ['TELEMETRY_SEQUENCE_OVERLAP', 'TELEMETRY_EVENT_DUPLICATED', 'TELEMETRY_EVENT_REPLAYED', 'TELEMETRY_TIME_INVALID']
          .includes(decision.code)) {
      void this.options.persistence?.recordAbuseSignal?.({
        accountId,
        connectionId: this.connections.get(accountId)?.connectionId ?? null,
        matchId: message.matchId,
        category: 'telemetry-replay',
        severity: 'warning',
        reason: decision.code.toLowerCase(),
        correlationId,
        occurredAt: Date.now()
      }).catch(error => this.options.log('abuse-signal-persistence-error', { error: String(error) }));
    }
  }
}
