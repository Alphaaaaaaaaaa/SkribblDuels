import { randomUUID } from 'node:crypto';
import type {
  GatewayClientIdentity,
  GatewayMatchEventMessage,
  GatewayMatchSnapshotMessage,
  GatewayMatchmakingEvent,
  GatewayMatchmakingJoinMessage,
  GatewayMatchmakingState,
  GatewayQueueStatusMessage,
  GatewayReadyMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';

type DuelFormat = GatewayMatchmakingJoinMessage['format'];

export interface MatchmakingPeer {
  identity: GatewayClientIdentity;
  send(message: GatewayServerMessage): void;
}

export interface GatewayMatchmakerOptions {
  readyTimeoutMs: number;
  simulatedPlayersEnabled: boolean;
  simulatedMatchDelayMs: number;
  simulatedReadyDelayMs: number;
  now?: () => number;
  createId?: () => string;
  random?: () => number;
}

interface QueueEntry extends MatchmakingPeer {
  requestId: string;
  format: DuelFormat;
  joinedAt: number;
  simulationTimer: ReturnType<typeof setTimeout> | null;
}

interface MatchParticipant extends MatchmakingPeer {
  ready: boolean;
  simulated: boolean;
}

interface ActiveMatch {
  matchId: string;
  format: DuelFormat;
  phase: GatewayMatchmakingState['phase'];
  participants: MatchParticipant[];
  readyDeadlineAt: number | null;
  startingAccountId: string;
  createdAt: number;
  revision: number;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  simulatedReadyTimer: ReturnType<typeof setTimeout> | null;
}

export type ReadyDecision =
  | { ok: true }
  | { ok: false; code: string; message: string };

const SIMULATED_NAMES = ['QueueBot Atlas', 'QueueBot Nova', 'QueueBot Pixel', 'QueueBot Echo'];

export class GatewayMatchmaker {
  private readonly queues: Record<DuelFormat, QueueEntry[]> = { casual: [], ranked: [] };
  private readonly matches = new Map<string, ActiveMatch>();
  private readonly accountMatches = new Map<string, string>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly random: () => number;
  private simulatedNameIndex = 0;

  public constructor(private readonly options: GatewayMatchmakerOptions) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.random = options.random ?? Math.random;
  }

  public join(peer: MatchmakingPeer, request: GatewayMatchmakingJoinMessage): void {
    this.cancelAccount(peer.identity.accountId, 'superseded-by-new-matchmaking');
    const joinedAt = this.now();
    const entry: QueueEntry = {
      ...peer,
      requestId: request.requestId,
      format: request.format,
      joinedAt,
      simulationTimer: null
    };
    this.queues[request.format].push(entry);
    this.publishQueuePositions(request.format);
    this.matchQueuedPlayers(request.format);

    if (this.options.simulatedPlayersEnabled && this.isQueued(entry)) {
      entry.simulationTimer = setTimeout(() => {
        entry.simulationTimer = null;
        if (!this.removeQueueEntry(entry)) return;
        this.createMatch(entry, this.createSimulatedPeer());
        this.publishQueuePositions(entry.format);
      }, this.options.simulatedMatchDelayMs);
      entry.simulationTimer.unref?.();
    }
  }

  public leave(accountId: string, requestId: string): void {
    const removed = this.removeQueuedAccount(accountId);
    const matchId = this.accountMatches.get(accountId);
    if (matchId) this.abortMatch(matchId, accountId, 'matchmaking-left');
    if (removed) {
      removed.send(this.queueStatus(removed, false, null, requestId));
      this.publishQueuePositions(removed.format);
    }
  }

  public disconnect(accountId: string): void {
    const removed = this.removeQueuedAccount(accountId);
    const matchId = this.accountMatches.get(accountId);
    if (matchId) this.abortMatch(matchId, accountId, 'player-disconnected');
    if (removed) this.publishQueuePositions(removed.format);
  }

  public setReady(accountId: string, message: GatewayReadyMessage): ReadyDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The ready-check match is no longer active.' };
    }
    if (match.phase !== 'ready-check') {
      return { ok: false, code: 'READY_CHECK_CLOSED', message: 'The ready check has already closed.' };
    }
    const participant = match.participants.find(item => item.identity.accountId === accountId && !item.simulated);
    if (!participant) {
      return { ok: false, code: 'READY_PARTICIPANT_INVALID', message: 'This account is not a real participant in the match.' };
    }
    if (participant.ready === message.ready) return { ok: true };
    participant.ready = message.ready;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'READY_CHANGED',
      accountId,
      reason: message.ready ? 'ready' : 'not-ready'
    });
    this.emitSnapshot(match);
    this.completeReadyCheckIfPossible(match);
    return { ok: true };
  }

  public close(): void {
    for (const format of ['casual', 'ranked'] as const) {
      for (const entry of this.queues[format]) {
        if (entry.simulationTimer) clearTimeout(entry.simulationTimer);
      }
      this.queues[format] = [];
    }
    for (const match of this.matches.values()) this.clearMatchTimers(match);
    this.matches.clear();
    this.accountMatches.clear();
  }

  private cancelAccount(accountId: string, reason: string): void {
    const queued = this.removeQueuedAccount(accountId);
    if (queued) {
      queued.send(this.queueStatus(queued, false, null));
      this.publishQueuePositions(queued.format);
    }
    const matchId = this.accountMatches.get(accountId);
    if (matchId) this.abortMatch(matchId, accountId, reason);
  }

  private matchQueuedPlayers(format: DuelFormat): void {
    const queue = this.queues[format];
    while (queue.length >= 2) {
      const first = queue.shift();
      const second = queue.shift();
      if (!first || !second) return;
      if (first.simulationTimer) clearTimeout(first.simulationTimer);
      if (second.simulationTimer) clearTimeout(second.simulationTimer);
      first.simulationTimer = null;
      second.simulationTimer = null;
      this.createMatch(first, second);
    }
    this.publishQueuePositions(format);
  }

  private createMatch(first: QueueEntry, second: QueueEntry | MatchParticipant): void {
    const createdAt = this.now();
    const matchId = `match-${this.createId()}`;
    const participants: MatchParticipant[] = [
      this.asParticipant(first, false),
      'requestId' in second ? this.asParticipant(second, false) : second
    ];
    const startingIndex = Math.min(participants.length - 1, Math.floor(this.random() * participants.length));
    const match: ActiveMatch = {
      matchId,
      format: first.format,
      phase: 'ready-check',
      participants,
      readyDeadlineAt: createdAt + this.options.readyTimeoutMs,
      startingAccountId: participants[startingIndex]!.identity.accountId,
      createdAt,
      revision: 1,
      expiryTimer: null,
      simulatedReadyTimer: null
    };
    this.matches.set(matchId, match);
    for (const participant of participants) {
      if (!participant.simulated) this.accountMatches.set(participant.identity.accountId, matchId);
    }
    first.send(this.queueStatus(first, false, null));
    if ('requestId' in second) second.send(this.queueStatus(second, false, null));
    this.emitSnapshot(match);

    match.expiryTimer = setTimeout(() => this.expireReadyCheck(matchId), this.options.readyTimeoutMs);
    match.expiryTimer.unref?.();
    const simulated = participants.find(participant => participant.simulated);
    if (simulated) {
      match.simulatedReadyTimer = setTimeout(() => {
        match.simulatedReadyTimer = null;
        if (match.phase !== 'ready-check') return;
        simulated.ready = true;
        match.revision += 1;
        this.emitEvent(match, {
          type: 'READY_CHANGED',
          accountId: simulated.identity.accountId,
          reason: 'simulated-ready'
        });
        this.emitSnapshot(match);
        this.completeReadyCheckIfPossible(match);
      }, this.options.simulatedReadyDelayMs);
      match.simulatedReadyTimer.unref?.();
    }
  }

  private completeReadyCheckIfPossible(match: ActiveMatch): void {
    if (match.phase !== 'ready-check' || !match.participants.every(participant => participant.ready)) return;
    match.phase = 'draft';
    match.readyDeadlineAt = null;
    match.revision += 1;
    this.clearMatchTimers(match);
    this.emitEvent(match, {
      type: 'READY_CHECK_COMPLETED',
      accountId: null,
      reason: 'all-participants-ready'
    });
    this.emitSnapshot(match);
  }

  private expireReadyCheck(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.phase !== 'ready-check') return;
    match.phase = 'cancelled';
    match.readyDeadlineAt = null;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'READY_CHECK_EXPIRED',
      accountId: null,
      reason: 'ready-timeout'
    });
    this.emitSnapshot(match);
    this.deleteMatch(match);
  }

  private abortMatch(matchId: string, accountId: string | null, reason: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    match.phase = 'cancelled';
    match.readyDeadlineAt = null;
    match.revision += 1;
    this.emitEvent(match, { type: 'MATCH_ABORTED', accountId, reason });
    this.emitSnapshot(match);
    this.deleteMatch(match);
  }

  private deleteMatch(match: ActiveMatch): void {
    this.clearMatchTimers(match);
    this.matches.delete(match.matchId);
    for (const participant of match.participants) {
      if (this.accountMatches.get(participant.identity.accountId) === match.matchId) {
        this.accountMatches.delete(participant.identity.accountId);
      }
    }
  }

  private clearMatchTimers(match: ActiveMatch): void {
    if (match.expiryTimer) clearTimeout(match.expiryTimer);
    if (match.simulatedReadyTimer) clearTimeout(match.simulatedReadyTimer);
    match.expiryTimer = null;
    match.simulatedReadyTimer = null;
  }

  private emitSnapshot(match: ActiveMatch): void {
    const message: GatewayMatchSnapshotMessage = {
      type: 'MATCH_SNAPSHOT',
      matchId: match.matchId,
      revision: match.revision,
      state: this.publicState(match)
    };
    for (const participant of match.participants) {
      if (!participant.simulated) participant.send(message);
    }
  }

  private emitEvent(match: ActiveMatch, event: GatewayMatchmakingEvent): void {
    const message: GatewayMatchEventMessage = {
      type: 'MATCH_EVENT',
      matchId: match.matchId,
      revision: match.revision,
      event
    };
    for (const participant of match.participants) {
      if (!participant.simulated) participant.send(message);
    }
  }

  private publicState(match: ActiveMatch): GatewayMatchmakingState {
    return {
      format: match.format,
      phase: match.phase,
      participants: match.participants.map(participant => ({
        accountId: participant.identity.accountId,
        displayName: participant.identity.displayName,
        ready: participant.ready,
        simulated: participant.simulated
      })),
      readyDeadlineAt: match.readyDeadlineAt,
      startingAccountId: match.startingAccountId,
      createdAt: match.createdAt
    };
  }

  private asParticipant(peer: MatchmakingPeer, simulated: boolean): MatchParticipant {
    return { ...peer, ready: false, simulated };
  }

  private createSimulatedPeer(): MatchParticipant {
    const suffix = this.createId();
    const displayName = SIMULATED_NAMES[this.simulatedNameIndex % SIMULATED_NAMES.length]!;
    this.simulatedNameIndex += 1;
    return {
      identity: {
        accountId: `simulated-${suffix}`,
        displayName,
        discordUserId: null
      },
      ready: false,
      simulated: true,
      send() {}
    };
  }

  private queueStatus(
    entry: QueueEntry,
    queued: boolean,
    position: number | null,
    requestId = entry.requestId
  ): GatewayQueueStatusMessage {
    return {
      type: 'QUEUE_STATUS',
      requestId,
      format: entry.format,
      queued,
      position,
      joinedAt: queued ? entry.joinedAt : null
    };
  }

  private publishQueuePositions(format: DuelFormat): void {
    this.queues[format].forEach((entry, index) => entry.send(this.queueStatus(entry, true, index + 1)));
  }

  private isQueued(entry: QueueEntry): boolean {
    return this.queues[entry.format].includes(entry);
  }

  private removeQueueEntry(entry: QueueEntry): boolean {
    const queue = this.queues[entry.format];
    const index = queue.indexOf(entry);
    if (index < 0) return false;
    queue.splice(index, 1);
    if (entry.simulationTimer) clearTimeout(entry.simulationTimer);
    entry.simulationTimer = null;
    return true;
  }

  private removeQueuedAccount(accountId: string): QueueEntry | null {
    for (const format of ['casual', 'ranked'] as const) {
      const entry = this.queues[format].find(item => item.identity.accountId === accountId);
      if (!entry) continue;
      this.removeQueueEntry(entry);
      return entry;
    }
    return null;
  }
}
