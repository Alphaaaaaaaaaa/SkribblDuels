import { randomUUID } from 'node:crypto';
import type {
  GatewayClientCapability,
  GatewayClientIdentity,
  GatewayDraftBoardSnapshot,
  GatewayDraftPick,
  GatewayDraftPickMessage,
  GatewayDraftState,
  GatewayMatchEventMessage,
  GatewayMatchSnapshotMessage,
  GatewayMatchmakingEvent,
  GatewayMatchmakingJoinMessage,
  GatewayMatchmakingState,
  GatewayQueueStatusMessage,
  GatewayReadyMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { GatewayDraftAuthority } from './draftAuthority';

type DuelFormat = GatewayMatchmakingJoinMessage['format'];

export interface MatchmakingPeer {
  identity: GatewayClientIdentity;
  capabilities: readonly GatewayClientCapability[];
  send(message: GatewayServerMessage): void;
}

export interface GatewayMatchmakerOptions {
  readyTimeoutMs: number;
  simulatedPlayersEnabled: boolean;
  simulatedMatchDelayMs: number;
  simulatedReadyDelayMs: number;
  draftPickTimeoutMs: number;
  simulatedDraftPickDelayMs: number;
  matchCountdownMs: number;
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

interface ActiveDraft {
  status: GatewayDraftState['status'];
  requiredPickCount: 9 | 25;
  turnAccountId: string | null;
  selectionDeadlineAt: number | null;
  picks: GatewayDraftPick[];
  availableChallengeIds: string[];
  board: GatewayDraftBoardSnapshot | null;
  seed: number;
  capabilities: GatewayClientCapability[];
}

interface ActiveMatch {
  matchId: string;
  format: DuelFormat;
  phase: GatewayMatchmakingState['phase'];
  participants: MatchParticipant[];
  readyDeadlineAt: number | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  startingAccountId: string;
  createdAt: number;
  revision: number;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  simulatedReadyTimer: ReturnType<typeof setTimeout> | null;
  draftTimer: ReturnType<typeof setTimeout> | null;
  simulatedDraftTimer: ReturnType<typeof setTimeout> | null;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  draft: ActiveDraft | null;
}

export type ReadyDecision =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type DraftDecision = ReadyDecision;

const SIMULATED_NAMES = ['QueueBot Atlas', 'QueueBot Nova', 'QueueBot Pixel', 'QueueBot Echo'];

export class GatewayMatchmaker {
  private readonly queues: Record<DuelFormat, QueueEntry[]> = { casual: [], ranked: [] };
  private readonly matches = new Map<string, ActiveMatch>();
  private readonly accountMatches = new Map<string, string>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly random: () => number;
  private readonly draftAuthority = new GatewayDraftAuthority();
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

  public pickDraftChallenge(accountId: string, message: GatewayDraftPickMessage): DraftDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The draft match is no longer active.' };
    }
    const draft = match.draft;
    if (match.phase !== 'draft' || !draft || draft.status !== 'selecting') {
      return { ok: false, code: 'DRAFT_CLOSED', message: 'The challenge draft has already closed.' };
    }
    if (message.clientRevision !== match.revision) {
      this.emitSnapshotToAccount(match, accountId);
      return {
        ok: false,
        code: 'DRAFT_REVISION_STALE',
        message: 'The draft changed before this selection arrived. The latest state was restored.'
      };
    }
    if (draft.turnAccountId !== accountId) {
      return { ok: false, code: 'DRAFT_OUT_OF_TURN', message: 'It is not this account\'s draft turn.' };
    }
    if (draft.selectionDeadlineAt !== null && this.now() >= draft.selectionDeadlineAt) {
      this.makeAutomaticDraftPick(match.matchId, accountId, 'selection-timeout');
      return {
        ok: false,
        code: 'DRAFT_TURN_EXPIRED',
        message: 'The 15-second selection window expired before this pick arrived.'
      };
    }
    const participant = match.participants.find(item =>
      item.identity.accountId === accountId && !item.simulated
    );
    if (!participant) {
      return { ok: false, code: 'DRAFT_PARTICIPANT_INVALID', message: 'This account cannot make the requested draft pick.' };
    }
    if (!draft.availableChallengeIds.includes(message.challengeId)) {
      return {
        ok: false,
        code: 'DRAFT_CHALLENGE_UNAVAILABLE',
        message: 'That challenge is unavailable, already selected or conflicts with the current board.'
      };
    }
    this.acceptDraftPick(match, accountId, message.challengeId, false, 'player-selection');
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
      countdownEndsAt: null,
      startedAt: null,
      startingAccountId: participants[startingIndex]!.identity.accountId,
      createdAt,
      revision: 1,
      expiryTimer: null,
      simulatedReadyTimer: null,
      draftTimer: null,
      simulatedDraftTimer: null,
      countdownTimer: null,
      draft: null
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
    const capabilities = this.sharedCapabilities(match.participants);
    const seed = Math.floor(this.random() * 0x1_0000_0000) >>> 0;
    const availableChallengeIds = this.draftAuthority.availableChallengeIds(
      match.format,
      [],
      capabilities,
      seed
    );
    const requiredPickCount = this.draftAuthority.requiredPickCount(match.format);
    if (availableChallengeIds.length < requiredPickCount) {
      this.abortMatch(match.matchId, null, 'insufficient-shared-draft-capabilities');
      return;
    }
    match.phase = 'draft';
    match.readyDeadlineAt = null;
    match.countdownEndsAt = null;
    match.startedAt = null;
    match.draft = {
      status: 'selecting',
      requiredPickCount,
      turnAccountId: match.startingAccountId,
      selectionDeadlineAt: this.now() + this.options.draftPickTimeoutMs,
      picks: [],
      availableChallengeIds,
      board: null,
      seed,
      capabilities
    };
    match.revision += 1;
    this.clearReadyTimers(match);
    this.emitEvent(match, {
      type: 'READY_CHECK_COMPLETED',
      accountId: null,
      reason: 'all-participants-ready'
    });
    this.emitEvent(match, {
      type: 'DRAFT_STARTED',
      accountId: match.startingAccountId,
      reason: 'random-starting-player'
    });
    this.emitSnapshot(match);
    this.armDraftTurn(match);
  }

  private acceptDraftPick(
    match: ActiveMatch,
    accountId: string,
    challengeId: string,
    automatic: boolean,
    reason: string
  ): void {
    const draft = match.draft;
    if (match.phase !== 'draft' || !draft || draft.status !== 'selecting') return;
    if (draft.turnAccountId !== accountId || !draft.availableChallengeIds.includes(challengeId)) return;
    const definitionVersion = this.draftAuthority.definitionVersion(challengeId);
    if (definitionVersion === null) {
      this.abortMatch(match.matchId, null, 'unknown-authoritative-draft-challenge');
      return;
    }

    this.clearDraftTimers(match);
    const pick: GatewayDraftPick = {
      pickNumber: draft.picks.length + 1,
      accountId,
      challengeId,
      definitionVersion,
      automatic,
      pickedAt: this.now()
    };
    draft.picks.push(pick);
    match.revision += 1;
    this.emitEvent(match, {
      type: reason === 'selection-timeout' ? 'DRAFT_PICK_TIMED_OUT' : 'DRAFT_PICKED',
      accountId,
      reason,
      challengeId,
      pickNumber: pick.pickNumber,
      automatic
    });

    if (draft.picks.length === draft.requiredPickCount) {
      try {
        draft.board = this.draftAuthority.createCompletedBoard(
          match.format,
          draft.picks.map(item => item.challengeId),
          draft.capabilities,
          draft.seed,
          this.now()
        );
      } catch {
        this.abortMatch(match.matchId, null, 'authoritative-draft-validation-failed');
        return;
      }
      draft.status = 'complete';
      draft.turnAccountId = null;
      draft.selectionDeadlineAt = null;
      draft.availableChallengeIds = [];
      this.emitEvent(match, {
        type: 'DRAFT_COMPLETED',
        accountId: null,
        reason: 'required-board-size-reached'
      });
      this.beginCountdown(match);
      return;
    }

    const currentIndex = match.participants.findIndex(participant =>
      participant.identity.accountId === accountId
    );
    const next = match.participants[(currentIndex + 1) % match.participants.length];
    if (!next) {
      this.abortMatch(match.matchId, null, 'draft-turn-participant-missing');
      return;
    }
    draft.turnAccountId = next.identity.accountId;
    draft.selectionDeadlineAt = this.now() + this.options.draftPickTimeoutMs;
    draft.availableChallengeIds = this.draftAuthority.availableChallengeIds(
      match.format,
      draft.picks.map(item => item.challengeId),
      draft.capabilities,
      draft.seed
    );
    if (draft.availableChallengeIds.length === 0) {
      this.abortMatch(match.matchId, null, 'no-compatible-draft-challenge-remaining');
      return;
    }
    this.emitSnapshot(match);
    this.armDraftTurn(match);
  }

  private armDraftTurn(match: ActiveMatch): void {
    const draft = match.draft;
    if (match.phase !== 'draft' || !draft || draft.status !== 'selecting' || !draft.turnAccountId) return;
    this.clearDraftTimers(match);
    const accountId = draft.turnAccountId;
    match.draftTimer = setTimeout(() => {
      match.draftTimer = null;
      this.makeAutomaticDraftPick(match.matchId, accountId, 'selection-timeout');
    }, this.options.draftPickTimeoutMs);
    match.draftTimer.unref?.();

    const participant = match.participants.find(item => item.identity.accountId === accountId);
    if (participant?.simulated) {
      match.simulatedDraftTimer = setTimeout(() => {
        match.simulatedDraftTimer = null;
        this.makeAutomaticDraftPick(match.matchId, accountId, 'simulated-selection');
      }, Math.min(this.options.simulatedDraftPickDelayMs, this.options.draftPickTimeoutMs));
      match.simulatedDraftTimer.unref?.();
    }
  }

  private makeAutomaticDraftPick(matchId: string, expectedAccountId: string, reason: string): void {
    const match = this.matches.get(matchId);
    const draft = match?.draft;
    if (!match || match.phase !== 'draft' || !draft || draft.status !== 'selecting') return;
    if (draft.turnAccountId !== expectedAccountId || draft.availableChallengeIds.length === 0) return;
    const index = Math.min(
      draft.availableChallengeIds.length - 1,
      Math.floor(this.random() * draft.availableChallengeIds.length)
    );
    const challengeId = draft.availableChallengeIds[index];
    if (!challengeId) {
      this.abortMatch(matchId, null, 'automatic-draft-selection-failed');
      return;
    }
    this.acceptDraftPick(match, expectedAccountId, challengeId, true, reason);
  }

  private beginCountdown(match: ActiveMatch): void {
    const draft = match.draft;
    if (match.phase !== 'draft' || !draft || draft.status !== 'complete' || !draft.board) return;
    this.clearDraftTimers(match);
    const countdownEndsAt = this.now() + this.options.matchCountdownMs;
    match.phase = 'countdown';
    match.countdownEndsAt = countdownEndsAt;
    match.startedAt = null;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'MATCH_COUNTDOWN_STARTED',
      accountId: null,
      reason: 'authoritative-ten-second-countdown'
    });
    this.emitSnapshot(match);
    match.countdownTimer = setTimeout(() => {
      match.countdownTimer = null;
      this.startRunningMatch(match.matchId, countdownEndsAt);
    }, Math.max(0, countdownEndsAt - this.now()));
    match.countdownTimer.unref?.();
  }

  private startRunningMatch(matchId: string, scheduledStartAt: number): void {
    const match = this.matches.get(matchId);
    if (!match || match.phase !== 'countdown' || match.countdownEndsAt !== scheduledStartAt) return;
    match.phase = 'running';
    match.countdownEndsAt = null;
    match.startedAt = scheduledStartAt;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'MATCH_STARTED',
      accountId: null,
      reason: 'countdown-completed'
    });
    this.emitSnapshot(match);
  }

  private sharedCapabilities(participants: readonly MatchParticipant[]): GatewayClientCapability[] {
    const first = participants[0]?.capabilities ?? [];
    return first.filter(capability =>
      participants.every(participant => participant.capabilities.includes(capability))
    );
  }

  private expireReadyCheck(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.phase !== 'ready-check') return;
    match.phase = 'cancelled';
    match.readyDeadlineAt = null;
    match.countdownEndsAt = null;
    match.startedAt = null;
    match.draft = null;
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
    match.countdownEndsAt = null;
    match.startedAt = null;
    match.draft = null;
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
    this.clearReadyTimers(match);
    this.clearDraftTimers(match);
    if (match.countdownTimer) clearTimeout(match.countdownTimer);
    match.countdownTimer = null;
  }

  private clearReadyTimers(match: ActiveMatch): void {
    if (match.expiryTimer) clearTimeout(match.expiryTimer);
    if (match.simulatedReadyTimer) clearTimeout(match.simulatedReadyTimer);
    match.expiryTimer = null;
    match.simulatedReadyTimer = null;
  }

  private clearDraftTimers(match: ActiveMatch): void {
    if (match.draftTimer) clearTimeout(match.draftTimer);
    if (match.simulatedDraftTimer) clearTimeout(match.simulatedDraftTimer);
    match.draftTimer = null;
    match.simulatedDraftTimer = null;
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

  private emitSnapshotToAccount(match: ActiveMatch, accountId: string): void {
    const participant = match.participants.find(item => item.identity.accountId === accountId);
    if (!participant || participant.simulated) return;
    participant.send({
      type: 'MATCH_SNAPSHOT',
      matchId: match.matchId,
      revision: match.revision,
      state: this.publicState(match)
    });
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
      countdownEndsAt: match.countdownEndsAt,
      startedAt: match.startedAt,
      startingAccountId: match.startingAccountId,
      createdAt: match.createdAt,
      draft: match.draft ? {
        status: match.draft.status,
        requiredPickCount: match.draft.requiredPickCount,
        turnAccountId: match.draft.turnAccountId,
        selectionDeadlineAt: match.draft.selectionDeadlineAt,
        picks: match.draft.picks.map(pick => ({ ...pick })),
        availableChallengeIds: [...match.draft.availableChallengeIds],
        board: match.draft.board ? structuredClone(match.draft.board) : null
      } : null
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
      capabilities: [
        'skribbl-telemetry',
        'official-word-list',
        'typo',
        'typo-challenges',
        'typo-drops',
        'typo-image-lab'
      ],
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
