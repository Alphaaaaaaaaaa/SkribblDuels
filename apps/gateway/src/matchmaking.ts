import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DUEL_CHAT_SPAM_MESSAGE,
  emptyDuelChatSpamState,
  evaluateDuelChatSpam
} from '@skribbl-duels/gateway-contracts';
import type {
  DuelChatSpamState,
  GatewayClientCapability,
  GatewayClientIdentity,
  GatewayAuthoritativeClaim,
  GatewayClaimCandidateMessage,
  GatewayClaimResolutionMessage,
  GatewayDrawProposeMessage,
  GatewayDrawProposal,
  GatewayDrawRespondMessage,
  GatewayDrawWithdrawMessage,
  GatewayDuelChatMessage,
  GatewayDuelChatSendMessage,
  GatewayDraftBoardSnapshot,
  GatewayDraftPick,
  GatewayDraftPickMessage,
  GatewayDraftState,
  GatewayInviteAcceptMessage,
  GatewayInviteCancelMessage,
  GatewayInviteCreateMessage,
  GatewayInviteStatusMessage,
  GatewayMatchEventMessage,
  GatewayMatchConclusion,
  GatewayMatchForfeitMessage,
  GatewayRematchRequestMessage,
  GatewayMatchSnapshotMessage,
  GatewayMatchmakingEvent,
  GatewayMatchmakingJoinMessage,
  GatewayMatchmakingState,
  GatewayQueueStatusMessage,
  GatewayReadyMessage,
  GatewayServerMessage,
  GatewayTelemetryBatchMessage
} from '@skribbl-duels/gateway-contracts';
import { GatewayDraftAuthority } from './draftAuthority';
import type {
  GatewayDurableInviteSnapshot,
  GatewayDurableMatchSnapshot,
  GatewayMatchAuthorityPersistence
} from './matchPersistence';
import {
  GatewayPlayerTelemetryAuthority,
  type GatewayPendingAuthorityCompletion,
  type GatewayTelemetryAuthoritySnapshot
} from './telemetryAuthority';

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
  draftFinalRevealMs: number;
  matchCountdownMs: number;
  reconnectGraceMs?: number;
  drawProposalTimeoutMs?: number;
  inviteTimeoutMs?: number;
  now?: () => number;
  createId?: () => string;
  random?: () => number;
  persistence?: GatewayMatchAuthorityPersistence;
  durableRetentionMs?: number;
  onPersistenceError?: (error: Error) => void;
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
  connected: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  chatSpam: DuelChatSpamState;
  claimSubmittedAt: number[];
}

interface ActiveDraft {
  status: GatewayDraftState['status'];
  requiredPickCount: 9 | 25;
  playerPickCount: 8 | 24;
  turnAccountId: string | null;
  selectionDeadlineAt: number | null;
  picks: GatewayDraftPick[];
  offeredChallengeIds: string[];
  finalCandidateChallengeIds: string[];
  finalRevealAt: number | null;
  pendingFinalChallengeId: string | null;
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
  drawProposalTimer: ReturnType<typeof setTimeout> | null;
  draft: ActiveDraft | null;
  claims: GatewayAuthoritativeClaim[];
  drawProposal: GatewayDrawProposal | null;
  conclusion: GatewayMatchConclusion | null;
  telemetryAuthorities: Map<string, GatewayPlayerTelemetryAuthority>;
  chatMessages: GatewayDuelChatMessage[];
  chatByClientId: Map<string, GatewayDuelChatMessage>;
  claimResolutions: Map<string, GatewayClaimResolutionMessage>;
  processedActions: Map<string, string>;
  rematchReadyAccountIds: Set<string>;
  departedAccountIds: Set<string>;
}

interface ActiveInvite extends GatewayDurableInviteSnapshot {
  creatorPeer: MatchmakingPeer | null;
  token: string | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
}

interface DurableMatchParticipant {
  identity: GatewayClientIdentity;
  capabilities: GatewayClientCapability[];
  ready: boolean;
  simulated: boolean;
  chatSpam?: DuelChatSpamState;
  chatSentAt?: number[];
  claimSubmittedAt: number[];
}

interface DurableActiveMatchAggregate {
  matchId: string;
  format: DuelFormat;
  phase: GatewayMatchmakingState['phase'];
  participants: DurableMatchParticipant[];
  readyDeadlineAt: number | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  startingAccountId: string;
  createdAt: number;
  revision: number;
  draft: ActiveDraft | null;
  claims: GatewayAuthoritativeClaim[];
  drawProposal: GatewayDrawProposal | null;
  conclusion: GatewayMatchConclusion | null;
  telemetryAuthorities: Array<[string, GatewayTelemetryAuthoritySnapshot]>;
  chatMessages: GatewayDuelChatMessage[];
  chatByClientId: Array<[string, GatewayDuelChatMessage]>;
  claimResolutions: Array<[string, GatewayClaimResolutionMessage]>;
  processedActions: Array<[string, string]>;
  rematchReadyAccountIds: string[];
  departedAccountIds?: string[];
}

interface BufferedMatchOutbound {
  accountId: string | null;
  message: GatewayServerMessage;
}

type AuthoritativeClaimSource = 'server-telemetry' | 'client-candidate';

export type ReadyDecision =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type DraftDecision = ReadyDecision;
export type TelemetryDecision = ReadyDecision;
export type ChatDecision = ReadyDecision;
export type MatchActionDecision = ReadyDecision;

export type MatchResumeDecision = {
  status: 'not-requested' | 'resumed' | 'not-found' | 'mismatch';
  matchId: string | null;
};

const SIMULATED_NAMES = ['QueueBot Atlas', 'QueueBot Nova', 'QueueBot Pixel', 'QueueBot Echo'];
const MAX_CHAT_HISTORY = 100;

function normalizeDuelChatMessage(value: string): string {
  const normalized = value
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(normalized).slice(0, 300).join('');
}

function normalizeRestoredChatMessage(
  message: GatewayDuelChatMessage | (Omit<GatewayDuelChatMessage, 'clientMessageId'> & { clientMessageId?: string })
): GatewayDuelChatMessage {
  return {
    ...message,
    clientMessageId: typeof message.clientMessageId === 'string' && message.clientMessageId.length > 0
      ? message.clientMessageId
      : message.messageId
  };
}

export class GatewayMatchmaker {
  private readonly queues: Record<DuelFormat, QueueEntry[]> = { casual: [], ranked: [] };
  private readonly matches = new Map<string, ActiveMatch>();
  private readonly accountMatches = new Map<string, string>();
  private readonly invites = new Map<string, ActiveInvite>();
  private readonly inviteByTokenHash = new Map<string, string>();
  private readonly inviteByCreator = new Map<string, string>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly random: () => number;
  private readonly draftAuthority = new GatewayDraftAuthority();
  private persistenceQueue: Promise<void> = Promise.resolve();
  private persistenceError: Error | null = null;
  private readonly bufferedOutbound = new Map<string, BufferedMatchOutbound[]>();
  private restoredMatchCount = 0;
  private simulatedNameIndex = 0;

  public constructor(private readonly options: GatewayMatchmakerOptions) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.random = options.random ?? Math.random;
  }

  public async restoreFromPersistence(): Promise<number> {
    const persistence = this.options.persistence;
    if (!persistence) return 0;
    const now = this.now();
    const [snapshots, invites] = await Promise.all([
      persistence.loadActiveMatches(now),
      persistence.loadActiveInvites?.(now) ?? Promise.resolve([])
    ]);
    for (const snapshot of snapshots) {
      try {
        this.restoreMatch(snapshot);
      } catch (error) {
        const invalid = error instanceof Error ? error : new Error(String(error));
        this.options.onPersistenceError?.(invalid);
        try {
          await persistence.finalizeMatch(snapshot.matchId, 'durable-snapshot-invalid', this.now());
        } catch (finalizeError) {
          this.reportPersistenceError(finalizeError);
        }
      }
    }
    for (const snapshot of invites) this.restoreInvite(snapshot);
    this.restoredMatchCount = this.matches.size;
    return this.restoredMatchCount;
  }

  public async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
  }

  public persistenceStatus(): { enabled: boolean; healthy: boolean; restoredMatches: number; error: string | null } {
    return {
      enabled: Boolean(this.options.persistence),
      healthy: this.persistenceError === null,
      restoredMatches: this.restoredMatchCount,
      error: this.persistenceError?.message ?? null
    };
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
    const match = matchId ? this.matches.get(matchId) : null;
    if (match?.phase === 'finished') this.detachFinishedParticipant(match, accountId);
    else if (matchId) this.abortMatch(matchId, accountId, 'matchmaking-left');
    if (removed) {
      removed.send(this.queueStatus(removed, false, null, requestId));
      this.publishQueuePositions(removed.format);
    }
  }

  public async createInvite(
    peer: MatchmakingPeer,
    message: GatewayInviteCreateMessage
  ): Promise<ReadyDecision> {
    const accountId = peer.identity.accountId;
    if (this.accountMatches.has(accountId)) {
      return { ok: false, code: 'INVITE_MATCH_ACTIVE', message: 'Finish or leave the active Duel before creating an invite.' };
    }
    const existingId = this.inviteByCreator.get(accountId);
    const existing = existingId ? this.invites.get(existingId) : null;
    if (existing?.state === 'waiting' && existing.createRequestId === message.requestId) {
      existing.creatorPeer = peer;
      peer.send(this.inviteStatus(existing, message.requestId, null));
      return { ok: true };
    }
    if (existing?.state === 'waiting') {
      await this.cancelInviteInternal(existing, `superseded-${message.requestId}`, 'superseded-by-new-invite');
    }
    const queued = this.removeQueuedAccount(accountId);
    if (queued) {
      queued.send(this.queueStatus(queued, false, null));
      this.publishQueuePositions(queued.format);
    }

    const createdAt = this.now();
    const token = randomBytes(24).toString('base64url');
    const proposed: GatewayDurableInviteSnapshot = {
      snapshotVersion: 1,
      inviteId: `invite-${this.createId()}`,
      tokenHash: this.hashInviteToken(token),
      creatorAccountId: accountId,
      createRequestId: message.requestId,
      format: message.format,
      state: 'waiting',
      createdAt,
      expiresAt: createdAt + (this.options.inviteTimeoutMs ?? 15 * 60_000),
      acceptedByAccountId: null,
      acceptRequestId: null,
      matchId: null
    };
    try {
      const stored = this.options.persistence?.createInvite
        ? await this.options.persistence.createInvite(proposed)
        : proposed;
      if (stored.tokenHash !== proposed.tokenHash) {
        return { ok: false, code: 'INVITE_RETRY_REQUIRED', message: 'This invite request was already used. Please create a fresh link.' };
      }
      const invite: ActiveInvite = {
        ...stored,
        creatorPeer: peer,
        token,
        expiryTimer: null
      };
      this.registerInvite(invite);
      peer.send(this.inviteStatus(invite, message.requestId, null));
      return { ok: true };
    } catch (error) {
      this.reportPersistenceError(error);
      return { ok: false, code: 'INVITE_PERSISTENCE_UNAVAILABLE', message: 'The durable invite service is temporarily unavailable.' };
    }
  }

  public async acceptInvite(
    peer: MatchmakingPeer,
    message: GatewayInviteAcceptMessage
  ): Promise<ReadyDecision> {
    const accountId = peer.identity.accountId;
    const tokenHash = this.hashInviteToken(message.token);
    const inviteId = this.inviteByTokenHash.get(tokenHash);
    const invite = inviteId ? this.invites.get(inviteId) : null;
    if (!invite) {
      return { ok: false, code: 'INVITE_INVALID', message: 'This Duel invite is invalid or has expired.' };
    }
    if (invite.state === 'accepted') {
      if (invite.acceptedByAccountId === accountId && invite.acceptRequestId === message.requestId) {
        peer.send(this.inviteStatus(invite, message.requestId, null));
        return { ok: true };
      }
      return { ok: false, code: 'INVITE_ALREADY_USED', message: 'This Duel invite has already been used.' };
    }
    if (this.accountMatches.has(accountId)) {
      return { ok: false, code: 'INVITE_MATCH_ACTIVE', message: 'This account already has an active Duel.' };
    }
    if (invite.state !== 'waiting' || invite.expiresAt <= this.now()) {
      this.expireInvite(invite.inviteId, invite.expiresAt);
      return { ok: false, code: 'INVITE_EXPIRED', message: 'This Duel invite has expired.' };
    }
    if (invite.creatorAccountId === accountId) {
      return { ok: false, code: 'INVITE_SELF_ACCEPT', message: 'You cannot accept your own Duel invite.' };
    }
    if (!invite.creatorPeer) {
      return { ok: false, code: 'INVITE_OWNER_OFFLINE', message: 'The invite creator is offline. Ask them to reconnect and try again.' };
    }
    if (this.accountMatches.has(invite.creatorAccountId)) {
      return { ok: false, code: 'INVITE_OWNER_BUSY', message: 'The invite creator is already in another Duel.' };
    }

    const matchId = `match-${this.createId()}`;
    try {
      const accepted = this.options.persistence?.acceptInvite
        ? await this.options.persistence.acceptInvite(tokenHash, accountId, message.requestId, matchId, this.now())
        : { ...invite, state: 'accepted' as const, acceptedByAccountId: accountId, acceptRequestId: message.requestId, matchId };
      if (!accepted) {
        return { ok: false, code: 'INVITE_ALREADY_USED', message: 'This Duel invite is no longer available.' };
      }
      Object.assign(invite, accepted);
    } catch (error) {
      this.reportPersistenceError(error);
      return { ok: false, code: 'INVITE_PERSISTENCE_UNAVAILABLE', message: 'The durable invite service is temporarily unavailable.' };
    }

    const acceptorQueue = this.removeQueuedAccount(accountId);
    if (acceptorQueue) this.publishQueuePositions(acceptorQueue.format);
    const ownInviteId = this.inviteByCreator.get(accountId);
    const ownInvite = ownInviteId ? this.invites.get(ownInviteId) : null;
    if (ownInvite?.state === 'waiting') {
      await this.cancelInviteInternal(ownInvite, `accepted-other-${message.requestId}`, 'accepted-another-invite');
    }
    if (invite.expiryTimer) clearTimeout(invite.expiryTimer);
    invite.expiryTimer = null;
    this.inviteByCreator.delete(invite.creatorAccountId);
    invite.creatorPeer.send(this.inviteStatus(invite, invite.createRequestId, null));
    peer.send(this.inviteStatus(invite, message.requestId, null));

    const creatorEntry = this.asInviteQueueEntry(invite.creatorPeer, invite, invite.createRequestId);
    const acceptorEntry = this.asInviteQueueEntry(peer, invite, message.requestId);
    this.createMatch(creatorEntry, acceptorEntry, matchId);
    return { ok: true };
  }

  public async cancelInvite(
    accountId: string,
    message: GatewayInviteCancelMessage
  ): Promise<ReadyDecision> {
    const invite = this.invites.get(message.inviteId);
    if (!invite || invite.creatorAccountId !== accountId) {
      return { ok: false, code: 'INVITE_NOT_FOUND', message: 'The Duel invite is no longer active.' };
    }
    if (invite.state === 'cancelled') {
      invite.creatorPeer?.send(this.inviteStatus(invite, message.requestId, 'cancelled-by-creator'));
      return { ok: true };
    }
    if (invite.state !== 'waiting') {
      return { ok: false, code: 'INVITE_NOT_ACTIVE', message: 'The Duel invite can no longer be cancelled.' };
    }
    return this.cancelInviteInternal(invite, message.requestId, 'cancelled-by-creator');
  }

  public disconnect(accountId: string): void {
    const removed = this.removeQueuedAccount(accountId);
    const matchId = this.accountMatches.get(accountId);
    const match = matchId ? this.matches.get(matchId) : null;
    const participant = match?.participants.find(item =>
      item.identity.accountId === accountId && !item.simulated
    );
    const inviteId = this.inviteByCreator.get(accountId);
    const invite = inviteId ? this.invites.get(inviteId) : null;
    if (invite?.creatorPeer?.identity.accountId === accountId) invite.creatorPeer = null;
    if (match && participant && participant.connected) {
      participant.connected = false;
      participant.send = () => {};
      if (participant.reconnectTimer) clearTimeout(participant.reconnectTimer);
      participant.reconnectTimer = setTimeout(() => {
        participant.reconnectTimer = null;
        const current = this.matches.get(match.matchId);
        const currentParticipant = current?.participants.find(item =>
          item.identity.accountId === accountId && !item.simulated
        );
        if (!current || !currentParticipant || currentParticipant.connected) return;
        if (current.phase === 'finished') {
          this.deleteMatch(current);
          return;
        }
        if (current.phase === 'running') {
          this.concludeDisconnectedParticipant(current, accountId, 'player-reconnect-timeout');
          return;
        }
        this.abortMatch(current.matchId, accountId, 'player-reconnect-timeout');
      }, this.options.reconnectGraceMs ?? 30_000);
      participant.reconnectTimer.unref?.();
    }
    if (removed) this.publishQueuePositions(removed.format);
  }

  public resume(peer: MatchmakingPeer, requestedMatchId?: string): MatchResumeDecision {
    const activeMatchId = this.accountMatches.get(peer.identity.accountId);
    if (!activeMatchId) {
      return { status: requestedMatchId ? 'not-found' : 'not-requested', matchId: null };
    }
    if (requestedMatchId && requestedMatchId !== activeMatchId) {
      return { status: 'mismatch', matchId: null };
    }
    const match = this.matches.get(activeMatchId);
    const participant = match?.participants.find(item =>
      item.identity.accountId === peer.identity.accountId && !item.simulated
    );
    if (!match || !participant) {
      return { status: requestedMatchId ? 'not-found' : 'not-requested', matchId: null };
    }
    if (participant.reconnectTimer) clearTimeout(participant.reconnectTimer);
    participant.reconnectTimer = null;
    if (match.phase === 'finished' && match.expiryTimer) {
      clearTimeout(match.expiryTimer);
      match.expiryTimer = null;
    }
    participant.identity = peer.identity;
    participant.capabilities = [...peer.capabilities];
    participant.send = peer.send;
    participant.connected = true;
    return { status: 'resumed', matchId: activeMatchId };
  }

  public attachPeer(peer: MatchmakingPeer): void {
    const inviteId = this.inviteByCreator.get(peer.identity.accountId);
    const invite = inviteId ? this.invites.get(inviteId) : null;
    if (!invite || invite.state !== 'waiting') return;
    invite.creatorPeer = peer;
    peer.send(this.inviteStatus(invite, invite.createRequestId, null));
  }

  public publishResumeSnapshot(accountId: string): void {
    const matchId = this.accountMatches.get(accountId);
    const match = matchId ? this.matches.get(matchId) : null;
    if (!match) return;
    const authority = match.telemetryAuthorities.get(accountId);
    if (authority) {
      this.emitToAccount(match, accountId, {
        type: 'TELEMETRY_ACK',
        matchId: match.matchId,
        lastSequence: authority.getLastSequence()
      });
    }
    this.emitSnapshotToAccount(match, accountId);
    for (const message of match.chatMessages) this.emitToAccount(match, accountId, message);
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
    if (!draft.offeredChallengeIds.includes(message.challengeId)) {
      return {
        ok: false,
        code: 'DRAFT_CHALLENGE_UNAVAILABLE',
        message: 'That challenge is not one of the two current server offers.'
      };
    }
    this.acceptDraftPick(match, accountId, message.challengeId, false, 'player-selection');
    return { ok: true };
  }

  public sendDuelChat(accountId: string, message: GatewayDuelChatSendMessage): ChatDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId || match.phase === 'cancelled') {
      return { ok: false, code: 'CHAT_MATCH_NOT_FOUND', message: 'The Duel chat is no longer active.' };
    }
    const participant = match.participants.find(item =>
      item.identity.accountId === accountId && !item.simulated
    );
    if (!participant) {
      return { ok: false, code: 'CHAT_PARTICIPANT_INVALID', message: 'This account is not a Duel participant.' };
    }
    const dedupeKey = `${accountId}:${message.clientMessageId}`;
    const duplicate = match.chatByClientId.get(dedupeKey);
    if (duplicate) {
      participant.send(duplicate);
      return { ok: true };
    }
    const normalized = normalizeDuelChatMessage(message.message);
    if (!normalized) {
      return { ok: false, code: 'CHAT_MESSAGE_EMPTY', message: 'The Duel message is empty after sanitization.' };
    }
    const now = this.now();
    const spam = evaluateDuelChatSpam(participant.chatSpam, now);
    participant.chatSpam = spam.state;
    if (!spam.allowed) {
      return { ok: false, code: 'CHAT_SPAM_DETECTED', message: DUEL_CHAT_SPAM_MESSAGE };
    }
    const outgoing: GatewayDuelChatMessage = {
      type: 'DUEL_CHAT_MESSAGE',
      matchId: match.matchId,
      messageId: `chat-${this.createId()}`,
      clientMessageId: message.clientMessageId,
      authorAccountId: accountId,
      authorDisplayName: participant.identity.displayName,
      message: normalized,
      occurredAt: now
    };
    match.chatMessages.push(outgoing);
    match.chatByClientId.set(dedupeKey, outgoing);
    while (match.chatMessages.length > MAX_CHAT_HISTORY) match.chatMessages.shift();
    if (match.chatByClientId.size > MAX_CHAT_HISTORY * 2) {
      const retainedIds = new Set(match.chatMessages.map(item => item.messageId));
      for (const [key, value] of match.chatByClientId) {
        if (!retainedIds.has(value.messageId)) match.chatByClientId.delete(key);
      }
    }
    this.broadcast(match, outgoing);
    this.persistMatch(match);
    return { ok: true };
  }

  public forfeitMatch(
    accountId: string,
    message: GatewayMatchForfeitMessage
  ): MatchActionDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The Duel match is no longer active.' };
    }
    const participant = this.realParticipant(match, accountId);
    if (!participant) {
      return { ok: false, code: 'MATCH_PARTICIPANT_INVALID', message: 'This account is not a real Duel participant.' };
    }
    const action = this.actionStatus(match, accountId, message.actionId, 'match-forfeit');
    if (action === 'duplicate') {
      this.emitSnapshotToAccount(match, accountId);
      return { ok: true };
    }
    if (action === 'conflict') {
      return { ok: false, code: 'ACTION_ID_REUSED', message: 'This action ID was already used for a different match action.' };
    }
    if (match.phase === 'finished' || match.conclusion) {
      return { ok: false, code: 'MATCH_ALREADY_FINISHED', message: 'The Duel already has an authoritative result.' };
    }
    if (match.phase !== 'running') {
      return { ok: false, code: 'MATCH_NOT_RUNNING', message: 'A Duel can be forfeited only after it has started.' };
    }
    const opponent = match.participants.find(item => item.identity.accountId !== accountId);
    if (!opponent) {
      return { ok: false, code: 'MATCH_OPPONENT_MISSING', message: 'The opponent could not be resolved.' };
    }
    this.rememberAction(match, accountId, message.actionId, 'match-forfeit');
    this.concludeMatch(match, {
      outcome: 'win',
      reason: 'player-forfeit',
      winnerAccountId: opponent.identity.accountId,
      loserAccountId: accountId,
      initiatedByAccountId: accountId,
      occurredAt: this.now()
    });
    return { ok: true };
  }

  public requestRematch(
    accountId: string,
    message: GatewayRematchRequestMessage
  ): MatchActionDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The finished Duel is no longer available for a rematch.' };
    }
    if (!this.realParticipant(match, accountId)) {
      return { ok: false, code: 'MATCH_PARTICIPANT_INVALID', message: 'This account is not a real Duel participant.' };
    }
    const action = this.actionStatus(match, accountId, message.actionId, 'match-rematch');
    if (action === 'duplicate') {
      this.emitSnapshotToAccount(match, accountId);
      return { ok: true };
    }
    if (action === 'conflict') {
      return { ok: false, code: 'ACTION_ID_REUSED', message: 'This action ID was already used for a different match action.' };
    }
    if (match.phase !== 'finished' || !match.conclusion) {
      return { ok: false, code: 'REMATCH_NOT_AVAILABLE', message: 'A rematch is available only after an authoritative result.' };
    }
    this.rememberAction(match, accountId, message.actionId, 'match-rematch');
    match.rematchReadyAccountIds.add(accountId);
    const simulated = match.participants.find(participant => participant.simulated);
    if (simulated) match.rematchReadyAccountIds.add(simulated.identity.accountId);
    match.revision += 1;
    this.emitEvent(match, {
      type: 'REMATCH_READY_CHANGED',
      accountId,
      reason: 'player-requested-rematch'
    });
    this.emitSnapshot(match);
    if (match.participants.every(participant =>
      match.rematchReadyAccountIds.has(participant.identity.accountId))) {
      this.startRematch(match);
    }
    return { ok: true };
  }

  public proposeDraw(
    accountId: string,
    message: GatewayDrawProposeMessage
  ): MatchActionDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The Duel match is no longer active.' };
    }
    if (!this.realParticipant(match, accountId)) {
      return { ok: false, code: 'MATCH_PARTICIPANT_INVALID', message: 'This account is not a real Duel participant.' };
    }
    const action = this.actionStatus(match, accountId, message.actionId, 'draw-propose');
    if (action === 'duplicate') {
      this.emitSnapshotToAccount(match, accountId);
      return { ok: true };
    }
    if (action === 'conflict') {
      return { ok: false, code: 'ACTION_ID_REUSED', message: 'This action ID was already used for a different match action.' };
    }
    if (match.phase === 'finished' || match.conclusion) {
      return { ok: false, code: 'MATCH_ALREADY_FINISHED', message: 'The Duel already has an authoritative result.' };
    }
    if (match.phase !== 'running') {
      return { ok: false, code: 'MATCH_NOT_RUNNING', message: 'A Draw can be proposed only after the Duel has started.' };
    }
    if (match.drawProposal) {
      return { ok: false, code: 'DRAW_PROPOSAL_ACTIVE', message: 'A Draw proposal is already active.' };
    }
    const createdAt = this.now();
    const proposal: GatewayDrawProposal = {
      proposalId: `draw-${this.createId()}`,
      proposerAccountId: accountId,
      createdAt,
      expiresAt: createdAt + (this.options.drawProposalTimeoutMs ?? 30_000)
    };
    this.rememberAction(match, accountId, message.actionId, 'draw-propose');
    match.drawProposal = proposal;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'DRAW_PROPOSED',
      accountId,
      reason: 'player-proposed-draw',
      proposalId: proposal.proposalId
    });
    this.emitSnapshot(match);
    this.armDrawProposalTimeout(match, proposal);
    return { ok: true };
  }

  public respondToDraw(
    accountId: string,
    message: GatewayDrawRespondMessage
  ): MatchActionDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The Duel match is no longer active.' };
    }
    if (!this.realParticipant(match, accountId)) {
      return { ok: false, code: 'MATCH_PARTICIPANT_INVALID', message: 'This account is not a real Duel participant.' };
    }
    const fingerprint = `draw-respond:${message.proposalId}:${message.accept}`;
    const action = this.actionStatus(match, accountId, message.actionId, fingerprint);
    if (action === 'duplicate') {
      this.emitSnapshotToAccount(match, accountId);
      return { ok: true };
    }
    if (action === 'conflict') {
      return { ok: false, code: 'ACTION_ID_REUSED', message: 'This action ID was already used for a different match action.' };
    }
    if (match.phase === 'finished' || match.conclusion) {
      return { ok: false, code: 'MATCH_ALREADY_FINISHED', message: 'The Duel already has an authoritative result.' };
    }
    if (match.phase !== 'running') {
      return { ok: false, code: 'MATCH_NOT_RUNNING', message: 'The Draw proposal is no longer actionable.' };
    }
    const proposal = match.drawProposal;
    if (!proposal || proposal.proposalId !== message.proposalId) {
      return { ok: false, code: 'DRAW_PROPOSAL_NOT_FOUND', message: 'The Draw proposal is no longer active.' };
    }
    if (proposal.proposerAccountId === accountId) {
      return { ok: false, code: 'DRAW_SELF_RESPONSE', message: 'The proposer cannot respond to their own Draw proposal.' };
    }
    if (this.now() >= proposal.expiresAt) {
      this.expireDrawProposal(match.matchId, proposal.proposalId, proposal.expiresAt);
      return { ok: false, code: 'DRAW_PROPOSAL_EXPIRED', message: 'The Draw proposal has expired.' };
    }
    this.rememberAction(match, accountId, message.actionId, fingerprint);
    if (message.accept) {
      this.concludeMatch(match, {
        outcome: 'draw',
        reason: 'mutual-draw',
        winnerAccountId: null,
        loserAccountId: null,
        initiatedByAccountId: proposal.proposerAccountId,
        occurredAt: this.now()
      });
      return { ok: true };
    }
    this.clearDrawProposalTimer(match);
    match.drawProposal = null;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'DRAW_REJECTED',
      accountId,
      reason: 'opponent-rejected-draw',
      proposalId: proposal.proposalId
    });
    this.emitSnapshot(match);
    return { ok: true };
  }

  public withdrawDraw(
    accountId: string,
    message: GatewayDrawWithdrawMessage
  ): MatchActionDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'MATCH_NOT_FOUND', message: 'The Duel match is no longer active.' };
    }
    if (!this.realParticipant(match, accountId)) {
      return { ok: false, code: 'MATCH_PARTICIPANT_INVALID', message: 'This account is not a real Duel participant.' };
    }
    const fingerprint = `draw-withdraw:${message.proposalId}`;
    const action = this.actionStatus(match, accountId, message.actionId, fingerprint);
    if (action === 'duplicate') {
      this.emitSnapshotToAccount(match, accountId);
      return { ok: true };
    }
    if (action === 'conflict') {
      return { ok: false, code: 'ACTION_ID_REUSED', message: 'This action ID was already used for a different match action.' };
    }
    if (match.phase === 'finished' || match.conclusion) {
      return { ok: false, code: 'MATCH_ALREADY_FINISHED', message: 'The Duel already has an authoritative result.' };
    }
    const proposal = match.drawProposal;
    if (!proposal || proposal.proposalId !== message.proposalId) {
      return { ok: false, code: 'DRAW_PROPOSAL_NOT_FOUND', message: 'The Draw proposal is no longer active.' };
    }
    if (proposal.proposerAccountId !== accountId) {
      return { ok: false, code: 'DRAW_WITHDRAW_FORBIDDEN', message: 'Only the proposer may withdraw this Draw proposal.' };
    }
    this.rememberAction(match, accountId, message.actionId, fingerprint);
    this.clearDrawProposalTimer(match);
    match.drawProposal = null;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'DRAW_WITHDRAWN',
      accountId,
      reason: 'proposer-withdrew-draw',
      proposalId: proposal.proposalId
    });
    this.emitSnapshot(match);
    return { ok: true };
  }

  public processTelemetryBatch(
    accountId: string,
    message: GatewayTelemetryBatchMessage
  ): TelemetryDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'TELEMETRY_MATCH_NOT_FOUND', message: 'The telemetry match is no longer active.' };
    }
    if (match.phase !== 'running') {
      return { ok: false, code: 'TELEMETRY_MATCH_NOT_RUNNING', message: 'Duel telemetry is accepted only while the match is running.' };
    }
    if (JSON.stringify(message).length > 262_144) {
      return { ok: false, code: 'TELEMETRY_BATCH_TOO_LARGE', message: 'The telemetry batch exceeds 256 KiB.' };
    }
    const authority = match.telemetryAuthorities.get(accountId);
    if (!authority) {
      return { ok: false, code: 'TELEMETRY_PARTICIPANT_INVALID', message: 'No telemetry authority exists for this participant.' };
    }
    const decision = authority.processBatch(message, this.now());
    const acknowledgement: GatewayServerMessage = {
      type: 'TELEMETRY_ACK',
      matchId: match.matchId,
      lastSequence: decision.lastSequence
    };
    if (decision.ok) {
      this.bufferToAccount(match, accountId, acknowledgement);
      let awarded = false;
      for (const completion of authority.pendingCompletions()) {
        if (match.phase !== 'running') break;
        if (match.claims.some(claim => claim.challengeId === completion.challengeId)) continue;
        awarded = true;
        const reachedWinTarget = this.awardAuthoritativeClaim(
          match,
          accountId,
          completion,
          completion.candidate.candidateId,
          'server-telemetry'
        );
        if (reachedWinTarget) {
          this.concludeClaimWin(match, accountId);
          break;
        }
      }
      if (match.phase === 'running') {
        if (awarded) this.emitSnapshot(match);
        else this.persistMatch(match);
      }
    } else {
      this.emitToAccount(match, accountId, acknowledgement);
    }
    return decision.ok
      ? { ok: true }
      : { ok: false, code: decision.code, message: decision.message };
  }

  public submitClaimCandidate(
    accountId: string,
    message: GatewayClaimCandidateMessage
  ): ReadyDecision {
    const match = this.matches.get(message.matchId);
    if (!match || this.accountMatches.get(accountId) !== message.matchId) {
      return { ok: false, code: 'CLAIM_MATCH_NOT_FOUND', message: 'The claim match is no longer active.' };
    }
    const dedupeKey = `${accountId}:${message.candidateId}`;
    const duplicate = match.claimResolutions.get(dedupeKey);
    if (duplicate) {
      this.emitToAccount(match, accountId, duplicate);
      return { ok: true };
    }
    const participant = match.participants.find(item =>
      item.identity.accountId === accountId && !item.simulated
    );
    if (!participant) {
      return { ok: false, code: 'CLAIM_PARTICIPANT_INVALID', message: 'This account is not a real Duel participant.' };
    }
    const submittedAt = this.now();
    participant.claimSubmittedAt = participant.claimSubmittedAt.filter(timestamp =>
      submittedAt - timestamp < 10_000
    );
    if (participant.claimSubmittedAt.length >= 20) {
      return { ok: false, code: 'CLAIM_RATE_LIMITED', message: 'Too many Claim candidates were submitted. Try again shortly.' };
    }
    participant.claimSubmittedAt.push(submittedAt);
    if (match.phase !== 'running') {
      const resolution = this.rejectClaim(match, accountId, message, 'claim-match-not-running');
      this.rememberClaimResolution(match, dedupeKey, resolution);
      this.bufferToAccount(match, accountId, resolution);
      this.persistMatch(match);
      return { ok: true };
    }
    if (match.claims.some(claim => claim.challengeId === message.challengeId)) {
      const resolution = this.rejectClaim(match, accountId, message, 'challenge-already-claimed');
      this.rememberClaimResolution(match, dedupeKey, resolution);
      this.bufferToAccount(match, accountId, resolution);
      this.persistMatch(match);
      return { ok: true };
    }
    const authority = match.telemetryAuthorities.get(accountId);
    if (!authority) {
      return { ok: false, code: 'CLAIM_PARTICIPANT_INVALID', message: 'No claim authority exists for this participant.' };
    }
    const validation = authority.validateClaim(message);
    if (!validation.ok) {
      const resolution = this.rejectClaim(match, accountId, message, validation.code.toLowerCase());
      this.rememberClaimResolution(match, dedupeKey, resolution);
      this.bufferToAccount(match, accountId, resolution);
      this.persistMatch(match);
      return { ok: true };
    }

    const reachedWinTarget = this.awardAuthoritativeClaim(
      match,
      accountId,
      {
        instanceId: validation.instanceId,
        challengeId: message.challengeId,
        definitionVersion: message.definitionVersion,
        candidate: validation.candidate
      },
      message.candidateId,
      'client-candidate'
    );
    if (reachedWinTarget) {
      this.concludeClaimWin(match, accountId);
      return { ok: true };
    }
    this.emitSnapshot(match);
    return { ok: true };
  }

  private awardAuthoritativeClaim(
    match: ActiveMatch,
    accountId: string,
    completion: GatewayPendingAuthorityCompletion,
    candidateId: string,
    source: AuthoritativeClaimSource
  ): boolean {
    const authority = match.telemetryAuthorities.get(accountId);
    if (!authority) return false;
    const occurredAt = this.now();
    const claimId = `claim-${this.createId()}`;
    authority.acceptClaim(completion.instanceId, claimId, occurredAt);
    match.revision += 1;
    const claim: GatewayAuthoritativeClaim = {
      claimId,
      candidateId,
      challengeId: completion.challengeId,
      definitionVersion: completion.definitionVersion,
      ownerAccountId: accountId,
      occurredAt,
      revision: match.revision
    };
    match.claims.push(claim);
    for (const participantAuthority of match.telemetryAuthorities.values()) {
      participantAuthority.closeChallenge(completion.challengeId);
    }
    const resolution: GatewayClaimResolutionMessage = {
      type: 'CLAIM_RESOLUTION',
      matchId: match.matchId,
      candidateId,
      challengeId: completion.challengeId,
      definitionVersion: completion.definitionVersion,
      ownerAccountId: accountId,
      accepted: true,
      claimId,
      reason: source === 'server-telemetry' ? 'server-telemetry-certified' : null,
      revision: match.revision,
      occurredAt
    };
    this.rememberClaimResolution(match, `${accountId}:${candidateId}`, resolution);
    this.broadcast(match, resolution);
    const board = match.draft?.board;
    const ownedCount = match.claims.filter(item => item.ownerAccountId === accountId).length;
    return Boolean(board && ownedCount >= board.winTarget);
  }

  private concludeClaimWin(match: ActiveMatch, accountId: string): void {
    const opponent = match.participants.find(item => item.identity.accountId !== accountId);
    if (!opponent) {
      this.abortMatch(match.matchId, accountId, 'match-opponent-missing-at-win');
      return;
    }
    this.concludeMatch(match, {
      outcome: 'win',
      reason: 'win-target-reached',
      winnerAccountId: accountId,
      loserAccountId: opponent.identity.accountId,
      initiatedByAccountId: accountId,
      occurredAt: this.now()
    });
  }

  public async close(): Promise<void> {
    for (const format of ['casual', 'ranked'] as const) {
      for (const entry of this.queues[format]) {
        if (entry.simulationTimer) clearTimeout(entry.simulationTimer);
      }
      this.queues[format] = [];
    }
    for (const match of this.matches.values()) {
      this.clearMatchTimers(match);
    }
    for (const invite of this.invites.values()) {
      if (invite.expiryTimer) clearTimeout(invite.expiryTimer);
      invite.expiryTimer = null;
    }
    await this.flushPersistence();
    for (const match of this.matches.values()) {
      for (const authority of match.telemetryAuthorities.values()) authority.destroy();
      match.telemetryAuthorities.clear();
    }
    this.matches.clear();
    this.accountMatches.clear();
    this.invites.clear();
    this.inviteByTokenHash.clear();
    this.inviteByCreator.clear();
    this.bufferedOutbound.clear();
  }

  private restoreInvite(snapshot: GatewayDurableInviteSnapshot): void {
    if (snapshot.state !== 'waiting' || snapshot.expiresAt <= this.now()) return;
    this.registerInvite({
      ...snapshot,
      creatorPeer: null,
      token: null,
      expiryTimer: null
    });
  }

  private registerInvite(invite: ActiveInvite): void {
    const previous = this.invites.get(invite.inviteId);
    if (previous?.expiryTimer) clearTimeout(previous.expiryTimer);
    this.invites.set(invite.inviteId, invite);
    this.inviteByTokenHash.set(invite.tokenHash, invite.inviteId);
    if (invite.state === 'waiting') this.inviteByCreator.set(invite.creatorAccountId, invite.inviteId);
    invite.expiryTimer = setTimeout(
      () => this.expireInvite(invite.inviteId, invite.expiresAt),
      Math.max(0, invite.expiresAt - this.now())
    );
    invite.expiryTimer.unref?.();
  }

  private expireInvite(inviteId: string, expectedExpiresAt: number): void {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.state !== 'waiting' || invite.expiresAt !== expectedExpiresAt) return;
    if (this.now() < expectedExpiresAt) {
      this.registerInvite(invite);
      return;
    }
    invite.state = 'expired';
    invite.expiryTimer = null;
    if (this.inviteByCreator.get(invite.creatorAccountId) === invite.inviteId) {
      this.inviteByCreator.delete(invite.creatorAccountId);
    }
    invite.creatorPeer?.send(this.inviteStatus(invite, invite.createRequestId, 'invite-expired'));
  }

  private async cancelInviteInternal(
    invite: ActiveInvite,
    requestId: string,
    reason: string
  ): Promise<ReadyDecision> {
    if (invite.expiryTimer) clearTimeout(invite.expiryTimer);
    invite.expiryTimer = null;
    invite.state = 'cancelled';
    if (this.inviteByCreator.get(invite.creatorAccountId) === invite.inviteId) {
      this.inviteByCreator.delete(invite.creatorAccountId);
    }
    invite.creatorPeer?.send(this.inviteStatus(invite, requestId, reason));
    try {
      const persisted = this.options.persistence?.cancelInvite
        ? await this.options.persistence.cancelInvite(
            invite.inviteId,
            invite.creatorAccountId,
            requestId,
            this.now()
          )
        : invite;
      if (!persisted) {
        return { ok: false, code: 'INVITE_NOT_ACTIVE', message: 'The Duel invite can no longer be cancelled.' };
      }
      Object.assign(invite, persisted, { creatorPeer: invite.creatorPeer, token: invite.token, expiryTimer: null });
      return { ok: true };
    } catch (error) {
      this.reportPersistenceError(error);
      return { ok: false, code: 'INVITE_PERSISTENCE_UNAVAILABLE', message: 'The durable invite service is temporarily unavailable.' };
    }
  }

  private inviteStatus(
    invite: ActiveInvite,
    requestId: string,
    reason: string | null
  ): GatewayInviteStatusMessage {
    return {
      type: 'INVITE_STATUS',
      requestId,
      inviteId: invite.inviteId,
      format: invite.format,
      status: invite.state,
      token: invite.state === 'waiting' ? invite.token : null,
      expiresAt: invite.expiresAt,
      matchId: invite.matchId,
      reason
    };
  }

  private asInviteQueueEntry(
    peer: MatchmakingPeer,
    invite: ActiveInvite,
    requestId: string
  ): QueueEntry {
    return {
      ...peer,
      requestId,
      format: invite.format,
      joinedAt: this.now(),
      simulationTimer: null
    };
  }

  private hashInviteToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private cancelAccount(accountId: string, reason: string): void {
    const inviteId = this.inviteByCreator.get(accountId);
    const invite = inviteId ? this.invites.get(inviteId) : null;
    if (invite?.state === 'waiting') {
      void this.cancelInviteInternal(invite, `automatic-${this.createId()}`, reason);
    }
    const queued = this.removeQueuedAccount(accountId);
    if (queued) {
      queued.send(this.queueStatus(queued, false, null));
      this.publishQueuePositions(queued.format);
    }
    const matchId = this.accountMatches.get(accountId);
    const match = matchId ? this.matches.get(matchId) : null;
    if (match?.phase === 'finished') this.detachFinishedParticipant(match, accountId);
    else if (matchId) this.abortMatch(matchId, accountId, reason);
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

  private createMatch(
    first: QueueEntry,
    second: QueueEntry | MatchParticipant,
    requestedMatchId?: string
  ): void {
    const createdAt = this.now();
    const matchId = requestedMatchId ?? `match-${this.createId()}`;
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
      drawProposalTimer: null,
      draft: null,
      claims: [],
      drawProposal: null,
      conclusion: null,
      telemetryAuthorities: new Map(),
      chatMessages: [],
      chatByClientId: new Map(),
      claimResolutions: new Map(),
      processedActions: new Map(),
      rematchReadyAccountIds: new Set(),
      departedAccountIds: new Set()
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
    const playerPickCount = (requiredPickCount - 1) as 8 | 24;
    const offeredChallengeIds = this.draftAuthority.createChallengeOffer(
      match.format,
      [],
      capabilities,
      seed,
      this.random
    );
    if (availableChallengeIds.length < requiredPickCount || offeredChallengeIds.length !== 2) {
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
      playerPickCount,
      turnAccountId: match.startingAccountId,
      selectionDeadlineAt: this.now() + this.options.draftPickTimeoutMs,
      picks: [],
      offeredChallengeIds,
      finalCandidateChallengeIds: [],
      finalRevealAt: null,
      pendingFinalChallengeId: null,
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
    if (draft.turnAccountId !== accountId || !draft.offeredChallengeIds.includes(challengeId)) return;
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
      source: reason === 'selection-timeout'
        ? 'selection-timeout'
        : reason === 'simulated-selection'
          ? 'simulated-selection'
          : 'player',
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

    if (draft.picks.length === draft.playerPickCount) {
      this.beginFinalRandomSelection(match);
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
    draft.offeredChallengeIds = this.draftAuthority.createChallengeOffer(
      match.format,
      draft.picks.map(item => item.challengeId),
      draft.capabilities,
      draft.seed,
      this.random
    );
    if (draft.offeredChallengeIds.length !== 2) {
      this.abortMatch(match.matchId, null, 'no-compatible-two-challenge-offer-remaining');
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
    if (draft.turnAccountId !== expectedAccountId || draft.offeredChallengeIds.length !== 2) return;
    const index = Math.min(
      draft.offeredChallengeIds.length - 1,
      Math.floor(this.random() * draft.offeredChallengeIds.length)
    );
    const challengeId = draft.offeredChallengeIds[index];
    if (!challengeId) {
      this.abortMatch(matchId, null, 'automatic-draft-selection-failed');
      return;
    }
    this.acceptDraftPick(match, expectedAccountId, challengeId, true, reason);
  }

  private beginFinalRandomSelection(match: ActiveMatch): void {
    const draft = match.draft;
    if (match.phase !== 'draft' || !draft || draft.status !== 'selecting') return;
    if (draft.picks.length !== draft.playerPickCount) return;
    this.clearDraftTimers(match);
    const selection = this.draftAuthority.chooseFinalChallengeId(
      match.format,
      draft.picks.map(item => item.challengeId),
      draft.capabilities,
      draft.seed,
      this.random
    );
    if (!selection) {
      this.abortMatch(match.matchId, null, 'server-random-final-challenge-unavailable');
      return;
    }
    const finalRevealAt = this.now() + this.options.draftFinalRevealMs;
    draft.status = 'finalizing';
    draft.turnAccountId = null;
    draft.selectionDeadlineAt = null;
    draft.offeredChallengeIds = [];
    draft.finalCandidateChallengeIds = selection.candidateChallengeIds;
    draft.finalRevealAt = finalRevealAt;
    draft.pendingFinalChallengeId = selection.challengeId;
    this.emitEvent(match, {
      type: 'DRAFT_FINAL_RANDOM_STARTED',
      accountId: null,
      reason: 'parity-final-field-server-random'
    });
    this.emitSnapshot(match);
    match.draftTimer = setTimeout(() => {
      match.draftTimer = null;
      this.revealFinalRandomSelection(match.matchId, finalRevealAt);
    }, Math.max(0, finalRevealAt - this.now()));
    match.draftTimer.unref?.();
  }

  private revealFinalRandomSelection(matchId: string, expectedRevealAt: number): void {
    const match = this.matches.get(matchId);
    const draft = match?.draft;
    if (!match || match.phase !== 'draft' || !draft || draft.status !== 'finalizing') return;
    if (draft.finalRevealAt !== expectedRevealAt || !draft.pendingFinalChallengeId) return;
    const challengeId = draft.pendingFinalChallengeId;
    const definitionVersion = this.draftAuthority.definitionVersion(challengeId);
    if (definitionVersion === null) {
      this.abortMatch(matchId, null, 'unknown-server-random-final-challenge');
      return;
    }
    draft.picks.push({
      pickNumber: draft.picks.length + 1,
      accountId: null,
      challengeId,
      definitionVersion,
      automatic: true,
      source: 'server-random',
      pickedAt: this.now()
    });
    match.revision += 1;
    this.emitEvent(match, {
      type: 'DRAFT_FINAL_RANDOM_SELECTED',
      accountId: null,
      reason: 'parity-final-field-server-random',
      challengeId,
      pickNumber: draft.picks.length,
      automatic: true
    });
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
    draft.finalCandidateChallengeIds = [];
    draft.finalRevealAt = null;
    draft.pendingFinalChallengeId = null;
    this.emitEvent(match, {
      type: 'DRAFT_COMPLETED',
      accountId: null,
      reason: 'server-random-final-field-revealed'
    });
    this.beginCountdown(match);
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
    const board = match.draft?.board;
    if (!board) {
      this.abortMatch(matchId, null, 'authoritative-board-missing-at-start');
      return;
    }
    match.phase = 'running';
    match.countdownEndsAt = null;
    match.startedAt = scheduledStartAt;
    for (const participant of match.participants) {
      if (participant.simulated) continue;
      match.telemetryAuthorities.set(
        participant.identity.accountId,
        new GatewayPlayerTelemetryAuthority(participant.identity.accountId, board, scheduledStartAt)
      );
    }
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
    match.claims = [];
    match.drawProposal = null;
    match.conclusion = null;
    match.rematchReadyAccountIds.clear();
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
    match.claims = [];
    match.drawProposal = null;
    match.conclusion = null;
    match.rematchReadyAccountIds.clear();
    match.revision += 1;
    this.emitEvent(match, { type: 'MATCH_ABORTED', accountId, reason });
    this.emitSnapshot(match);
    this.deleteMatch(match);
  }

  private deleteMatch(match: ActiveMatch, reason = 'match-removed'): void {
    this.clearMatchTimers(match);
    for (const authority of match.telemetryAuthorities.values()) authority.destroy();
    match.telemetryAuthorities.clear();
    this.matches.delete(match.matchId);
    for (const participant of match.participants) {
      if (this.accountMatches.get(participant.identity.accountId) === match.matchId) {
        this.accountMatches.delete(participant.identity.accountId);
      }
    }
    const persistence = this.options.persistence;
    if (persistence) {
      this.enqueuePersistence(() => persistence.finalizeMatch(match.matchId, reason, this.now()));
    }
  }

  private startRematch(match: ActiveMatch): void {
    if (match.phase !== 'finished' || !match.conclusion) return;
    const participants = match.participants.map(participant => ({
      ...participant,
      identity: { ...participant.identity },
      capabilities: [...participant.capabilities],
      ready: false,
      reconnectTimer: null,
      chatSpam: emptyDuelChatSpamState(),
      claimSubmittedAt: []
    }));
    const firstParticipant = participants[0];
    const secondParticipant = participants[1];
    if (!firstParticipant || !secondParticipant) return;
    const createdAt = this.now();
    match.revision += 1;
    this.emitEvent(match, {
      type: 'REMATCH_STARTED',
      accountId: null,
      reason: 'both-participants-requested-rematch'
    });
    this.persistMatch(match);
    this.deleteMatch(match);

    const asQueueEntry = (participant: MatchParticipant): QueueEntry => ({
      identity: participant.identity,
      capabilities: participant.capabilities,
      send: participant.send,
      requestId: `rematch-${this.createId()}`,
      format: match.format,
      joinedAt: createdAt,
      simulationTimer: null
    });
    const first = asQueueEntry(firstParticipant);
    const second: QueueEntry | MatchParticipant = secondParticipant.simulated
      ? secondParticipant
      : asQueueEntry(secondParticipant);
    this.createMatch(first, second);
  }

  private clearMatchTimers(match: ActiveMatch): void {
    this.clearReadyTimers(match);
    this.clearDraftTimers(match);
    if (match.countdownTimer) clearTimeout(match.countdownTimer);
    match.countdownTimer = null;
    this.clearDrawProposalTimer(match);
    for (const participant of match.participants) {
      if (participant.reconnectTimer) clearTimeout(participant.reconnectTimer);
      participant.reconnectTimer = null;
    }
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

  private realParticipant(match: ActiveMatch, accountId: string): MatchParticipant | null {
    return match.participants.find(item =>
      item.identity.accountId === accountId && !item.simulated
    ) ?? null;
  }

  private actionStatus(
    match: ActiveMatch,
    accountId: string,
    actionId: string,
    fingerprint: string
  ): 'new' | 'duplicate' | 'conflict' {
    const existing = match.processedActions.get(`${accountId}:${actionId}`);
    if (existing === undefined) return 'new';
    return existing === fingerprint ? 'duplicate' : 'conflict';
  }

  private rememberAction(
    match: ActiveMatch,
    accountId: string,
    actionId: string,
    fingerprint: string
  ): void {
    match.processedActions.set(`${accountId}:${actionId}`, fingerprint);
    while (match.processedActions.size > 512) {
      const oldest = match.processedActions.keys().next().value as string | undefined;
      if (!oldest) break;
      match.processedActions.delete(oldest);
    }
  }

  private armDrawProposalTimeout(match: ActiveMatch, proposal: GatewayDrawProposal): void {
    this.clearDrawProposalTimer(match);
    match.drawProposalTimer = setTimeout(() => {
      match.drawProposalTimer = null;
      this.expireDrawProposal(match.matchId, proposal.proposalId, proposal.expiresAt);
    }, Math.max(0, proposal.expiresAt - this.now()));
    match.drawProposalTimer.unref?.();
  }

  private expireDrawProposal(matchId: string, proposalId: string, expectedExpiresAt: number): void {
    const match = this.matches.get(matchId);
    const proposal = match?.drawProposal;
    if (!match || match.phase !== 'running' || !proposal) return;
    if (proposal.proposalId !== proposalId || proposal.expiresAt !== expectedExpiresAt) return;
    if (this.now() < proposal.expiresAt) {
      this.armDrawProposalTimeout(match, proposal);
      return;
    }
    match.drawProposal = null;
    match.revision += 1;
    this.emitEvent(match, {
      type: 'DRAW_EXPIRED',
      accountId: proposal.proposerAccountId,
      reason: 'draw-proposal-timeout',
      proposalId
    });
    this.emitSnapshot(match);
  }

  private clearDrawProposalTimer(match: ActiveMatch): void {
    if (match.drawProposalTimer) clearTimeout(match.drawProposalTimer);
    match.drawProposalTimer = null;
  }

  private concludeMatch(match: ActiveMatch, conclusion: GatewayMatchConclusion): boolean {
    if (match.phase !== 'running' || match.conclusion) return false;
    this.clearDrawProposalTimer(match);
    const proposalId = match.drawProposal?.proposalId;
    match.drawProposal = null;
    match.conclusion = { ...conclusion };
    match.rematchReadyAccountIds.clear();
    match.phase = 'finished';
    match.revision += 1;
    if (conclusion.reason === 'player-forfeit') {
      this.emitEvent(match, {
        type: 'MATCH_FORFEITED',
        accountId: conclusion.loserAccountId,
        reason: conclusion.reason
      });
    }
    this.emitEvent(match, {
      type: 'MATCH_FINISHED',
      accountId: conclusion.winnerAccountId,
      reason: conclusion.reason,
      ...(proposalId ? { proposalId } : {})
    });
    this.emitSnapshot(match);
    return true;
  }

  private concludeDisconnectedParticipant(
    match: ActiveMatch,
    disconnectedAccountId: string,
    abortReason: string
  ): void {
    const opponent = match.participants.find(participant =>
      participant.identity.accountId !== disconnectedAccountId
    );
    if (!opponent || (!opponent.simulated && !opponent.connected)) {
      this.abortMatch(match.matchId, disconnectedAccountId, `${abortReason}-no-connected-opponent`);
      return;
    }
    this.concludeMatch(match, {
      outcome: 'win',
      reason: 'player-disconnect',
      winnerAccountId: opponent.identity.accountId,
      loserAccountId: disconnectedAccountId,
      initiatedByAccountId: null,
      occurredAt: this.now()
    });
  }

  private detachFinishedParticipant(match: ActiveMatch, accountId: string): void {
    if (match.phase !== 'finished') return;
    const participant = match.participants.find(item => item.identity.accountId === accountId);
    if (!participant || participant.simulated) return;
    if (participant.reconnectTimer) clearTimeout(participant.reconnectTimer);
    participant.reconnectTimer = null;
    participant.connected = false;
    participant.send = () => {};
    match.departedAccountIds.add(accountId);
    // A rematch needs both terminal-match participants. Once either player
    // explicitly leaves, every outstanding rematch request is stale.
    match.rematchReadyAccountIds.clear();
    if (this.accountMatches.get(accountId) === match.matchId) this.accountMatches.delete(accountId);
    const retainedForAnotherParticipant = match.participants.some(item =>
      !item.simulated && this.accountMatches.get(item.identity.accountId) === match.matchId
    );
    if (!retainedForAnotherParticipant) {
      this.deleteMatch(match, 'finished-participants-left');
      return;
    }
    match.revision += 1;
    this.emitSnapshot(match);
  }

  private rejectClaim(
    match: ActiveMatch,
    accountId: string,
    message: GatewayClaimCandidateMessage,
    reason: string
  ): GatewayClaimResolutionMessage {
    return {
      type: 'CLAIM_RESOLUTION',
      matchId: match.matchId,
      candidateId: message.candidateId,
      challengeId: message.challengeId,
      definitionVersion: message.definitionVersion,
      ownerAccountId: accountId,
      accepted: false,
      claimId: null,
      reason,
      revision: match.revision,
      occurredAt: this.now()
    };
  }

  private rememberClaimResolution(
    match: ActiveMatch,
    key: string,
    resolution: GatewayClaimResolutionMessage
  ): void {
    match.claimResolutions.set(key, resolution);
    while (match.claimResolutions.size > 512) {
      const oldest = match.claimResolutions.keys().next().value as string | undefined;
      if (!oldest) break;
      match.claimResolutions.delete(oldest);
    }
  }

  private emitToAccount(match: ActiveMatch, accountId: string, message: GatewayServerMessage): void {
    const participant = match.participants.find(item =>
      item.identity.accountId === accountId && !item.simulated && item.connected
    );
    participant?.send(message);
  }

  private broadcast(match: ActiveMatch, message: GatewayServerMessage): void {
    this.bufferMatchOutbound(match, { accountId: null, message });
  }

  private emitSnapshot(match: ActiveMatch): void {
    const message: GatewayMatchSnapshotMessage = {
      type: 'MATCH_SNAPSHOT',
      matchId: match.matchId,
      revision: match.revision,
      state: this.publicState(match)
    };
    this.bufferMatchOutbound(match, { accountId: null, message });
    this.persistMatch(match);
  }

  private emitSnapshotToAccount(match: ActiveMatch, accountId: string): void {
    const participant = match.participants.find(item => item.identity.accountId === accountId);
    if (!participant || participant.simulated || !participant.connected) return;
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
    this.bufferMatchOutbound(match, { accountId: null, message });
  }

  private bufferToAccount(match: ActiveMatch, accountId: string, message: GatewayServerMessage): void {
    this.bufferMatchOutbound(match, { accountId, message });
  }

  private bufferMatchOutbound(match: ActiveMatch, outgoing: BufferedMatchOutbound): void {
    const pending = this.bufferedOutbound.get(match.matchId) ?? [];
    pending.push({ accountId: outgoing.accountId, message: structuredClone(outgoing.message) });
    this.bufferedOutbound.set(match.matchId, pending);
  }

  private deliverBuffered(match: ActiveMatch, pending: readonly BufferedMatchOutbound[]): void {
    for (const outgoing of pending) {
      if (outgoing.accountId !== null) {
        this.emitToAccount(match, outgoing.accountId, outgoing.message);
        continue;
      }
      for (const participant of match.participants) {
        if (!participant.simulated && participant.connected) participant.send(outgoing.message);
      }
    }
  }

  private persistMatch(match: ActiveMatch): void {
    const persistence = this.options.persistence;
    const pending = this.bufferedOutbound.get(match.matchId) ?? [];
    this.bufferedOutbound.delete(match.matchId);
    if (!persistence) {
      this.deliverBuffered(match, pending);
      return;
    }
    const savedAt = this.now();
    const snapshot: GatewayDurableMatchSnapshot = {
      snapshotVersion: 1,
      matchId: match.matchId,
      revision: match.revision,
      phase: match.phase,
      savedAt,
      expiresAt: savedAt + (this.options.durableRetentionMs ?? 24 * 60 * 60 * 1_000),
      aggregate: this.durableAggregate(match),
      idempotency: this.durableIdempotency(match)
    };
    this.enqueuePersistence(
      () => persistence.saveMatch(snapshot),
      () => this.deliverBuffered(match, pending)
    );
  }

  private durableAggregate(match: ActiveMatch): DurableActiveMatchAggregate {
    return {
      matchId: match.matchId,
      format: match.format,
      phase: match.phase,
      participants: match.participants.map(participant => ({
        identity: structuredClone(participant.identity),
        capabilities: [...participant.capabilities],
        ready: participant.ready,
        simulated: participant.simulated,
        chatSpam: { ...participant.chatSpam },
        claimSubmittedAt: [...participant.claimSubmittedAt]
      })),
      readyDeadlineAt: match.readyDeadlineAt,
      countdownEndsAt: match.countdownEndsAt,
      startedAt: match.startedAt,
      startingAccountId: match.startingAccountId,
      createdAt: match.createdAt,
      revision: match.revision,
      draft: match.draft ? structuredClone(match.draft) : null,
      claims: structuredClone(match.claims),
      drawProposal: match.drawProposal ? structuredClone(match.drawProposal) : null,
      conclusion: match.conclusion ? structuredClone(match.conclusion) : null,
      telemetryAuthorities: Array.from(match.telemetryAuthorities, ([accountId, authority]) => [
        accountId,
        authority.exportSnapshot()
      ]),
      chatMessages: structuredClone(match.chatMessages),
      chatByClientId: Array.from(match.chatByClientId, ([key, message]) => [key, structuredClone(message)]),
      claimResolutions: Array.from(match.claimResolutions, ([key, resolution]) => [key, structuredClone(resolution)]),
      processedActions: Array.from(match.processedActions),
      rematchReadyAccountIds: [...match.rematchReadyAccountIds],
      departedAccountIds: [...match.departedAccountIds]
    };
  }

  private durableIdempotency(match: ActiveMatch): GatewayDurableMatchSnapshot['idempotency'] {
    const rows: GatewayDurableMatchSnapshot['idempotency'] = [];
    for (const [compositeKey, fingerprint] of match.processedActions) {
      const separator = compositeKey.indexOf(':');
      rows.push({
        namespace: 'action',
        accountId: separator >= 0 ? compositeKey.slice(0, separator) : '',
        key: separator >= 0 ? compositeKey.slice(separator + 1) : compositeKey,
        fingerprint,
        result: null
      });
    }
    for (const [compositeKey, message] of match.chatByClientId) {
      const separator = compositeKey.indexOf(':');
      rows.push({
        namespace: 'chat',
        accountId: separator >= 0 ? compositeKey.slice(0, separator) : message.authorAccountId,
        key: separator >= 0 ? compositeKey.slice(separator + 1) : compositeKey,
        fingerprint: message.message,
        result: message
      });
    }
    for (const [compositeKey, resolution] of match.claimResolutions) {
      const separator = compositeKey.indexOf(':');
      rows.push({
        namespace: 'claim',
        accountId: separator >= 0 ? compositeKey.slice(0, separator) : resolution.ownerAccountId,
        key: separator >= 0 ? compositeKey.slice(separator + 1) : compositeKey,
        fingerprint: `${resolution.challengeId}:${resolution.definitionVersion}`,
        result: resolution
      });
    }
    for (const [accountId, authority] of match.telemetryAuthorities) {
      rows.push({
        namespace: 'telemetry',
        accountId,
        key: String(authority.getLastSequence()),
        fingerprint: `sequence:${authority.getLastSequence()}`,
        result: { lastSequence: authority.getLastSequence() }
      });
    }
    return rows;
  }

  private restoreMatch(snapshot: GatewayDurableMatchSnapshot): void {
    const aggregate = snapshot.aggregate as Partial<DurableActiveMatchAggregate> | null;
    if (!aggregate
        || aggregate.matchId !== snapshot.matchId
        || aggregate.revision !== snapshot.revision
        || aggregate.phase !== snapshot.phase
        || !Array.isArray(aggregate.participants)
        || aggregate.participants.length !== 2
        || typeof aggregate.startingAccountId !== 'string'
        || typeof aggregate.createdAt !== 'number') {
      throw new Error(`Durable Duel snapshot ${snapshot.matchId} is structurally invalid.`);
    }
    if (aggregate.phase === 'cancelled') {
      throw new Error(`Durable Duel snapshot ${snapshot.matchId} is already cancelled.`);
    }
    for (const participant of aggregate.participants) {
      const accountId = participant.identity?.accountId;
      if (!accountId || (!participant.simulated && this.accountMatches.has(accountId))) {
        throw new Error(`Durable Duel snapshot ${snapshot.matchId} has an invalid participant mapping.`);
      }
    }
    const draft = aggregate.draft ? structuredClone(aggregate.draft) : null;
    if (draft?.board) {
      for (const field of draft.board.fields) {
        if (this.draftAuthority.definitionVersion(field.challengeId) !== field.definitionVersion) {
          throw new Error(`Durable Duel snapshot ${snapshot.matchId} uses an unsupported challenge definition.`);
        }
      }
    }
    const participants: MatchParticipant[] = aggregate.participants.map(participant => ({
      identity: structuredClone(participant.identity),
      capabilities: [...participant.capabilities],
      ready: participant.ready,
      simulated: participant.simulated,
      connected: participant.simulated,
      reconnectTimer: null,
      chatSpam: participant.chatSpam
        ? { ...participant.chatSpam }
        : {
            score: 0,
            lastSentAt: participant.chatSentAt?.at(-1) ?? null
          },
      claimSubmittedAt: [...participant.claimSubmittedAt],
      send() {}
    }));
    const match: ActiveMatch = {
      matchId: aggregate.matchId,
      format: aggregate.format as DuelFormat,
      phase: aggregate.phase,
      participants,
      readyDeadlineAt: aggregate.readyDeadlineAt ?? null,
      countdownEndsAt: aggregate.countdownEndsAt ?? null,
      startedAt: aggregate.startedAt ?? null,
      startingAccountId: aggregate.startingAccountId,
      createdAt: aggregate.createdAt,
      revision: aggregate.revision,
      expiryTimer: null,
      simulatedReadyTimer: null,
      draftTimer: null,
      simulatedDraftTimer: null,
      countdownTimer: null,
      drawProposalTimer: null,
      draft,
      claims: structuredClone(aggregate.claims ?? []),
      drawProposal: aggregate.drawProposal ? structuredClone(aggregate.drawProposal) : null,
      conclusion: aggregate.conclusion ? structuredClone(aggregate.conclusion) : null,
      telemetryAuthorities: new Map(),
      chatMessages: (aggregate.chatMessages ?? []).map(message =>
        normalizeRestoredChatMessage(structuredClone(message))),
      chatByClientId: new Map((aggregate.chatByClientId ?? []).map(([key, message]) => [
        key,
        normalizeRestoredChatMessage(structuredClone(message))
      ])),
      claimResolutions: new Map(aggregate.claimResolutions ?? []),
      processedActions: new Map(aggregate.processedActions ?? []),
      rematchReadyAccountIds: new Set(aggregate.rematchReadyAccountIds ?? []),
      departedAccountIds: new Set(aggregate.departedAccountIds ?? [])
    };
    if (aggregate.telemetryAuthorities?.length) {
      if (!draft?.board || match.startedAt === null) {
        throw new Error(`Durable Duel snapshot ${snapshot.matchId} has telemetry without a running board.`);
      }
      for (const [accountId, authoritySnapshot] of aggregate.telemetryAuthorities) {
        match.telemetryAuthorities.set(accountId, new GatewayPlayerTelemetryAuthority(
          accountId,
          draft.board,
          match.startedAt,
          authoritySnapshot
        ));
      }
    }
    this.matches.set(match.matchId, match);
    for (const participant of participants) {
      if (!participant.simulated && !match.departedAccountIds.has(participant.identity.accountId)) {
        this.accountMatches.set(participant.identity.accountId, match.matchId);
      }
    }
    this.rearmRestoredMatch(match);
  }

  private rearmRestoredMatch(match: ActiveMatch): void {
    const now = this.now();
    const reconnectGraceMs = this.options.reconnectGraceMs ?? 30_000;
    for (const participant of match.participants) {
      if (participant.simulated || match.departedAccountIds.has(participant.identity.accountId)) continue;
      const accountId = participant.identity.accountId;
      participant.reconnectTimer = setTimeout(() => {
        participant.reconnectTimer = null;
        const current = this.matches.get(match.matchId);
        const currentParticipant = current?.participants.find(item => item.identity.accountId === accountId);
        if (!current || !currentParticipant || currentParticipant.connected) return;
        if (current.phase === 'finished') this.deleteMatch(current, 'durable-finished-reconnect-timeout');
        else if (current.phase === 'running') {
          this.concludeDisconnectedParticipant(current, accountId, 'durable-player-reconnect-timeout');
        } else this.abortMatch(current.matchId, accountId, 'durable-player-reconnect-timeout');
      }, reconnectGraceMs);
      participant.reconnectTimer.unref?.();
    }

    if (match.phase === 'ready-check' && match.readyDeadlineAt !== null) {
      match.expiryTimer = setTimeout(
        () => this.expireReadyCheck(match.matchId),
        Math.max(0, match.readyDeadlineAt - now)
      );
      match.expiryTimer.unref?.();
      const simulated = match.participants.find(participant => participant.simulated && !participant.ready);
      if (simulated) {
        match.simulatedReadyTimer = setTimeout(() => {
          match.simulatedReadyTimer = null;
          if (match.phase !== 'ready-check') return;
          simulated.ready = true;
          match.revision += 1;
          this.emitEvent(match, { type: 'READY_CHANGED', accountId: simulated.identity.accountId, reason: 'simulated-ready' });
          this.emitSnapshot(match);
          this.completeReadyCheckIfPossible(match);
        }, Math.min(this.options.simulatedReadyDelayMs, Math.max(0, match.readyDeadlineAt - now)));
        match.simulatedReadyTimer.unref?.();
      }
      return;
    }

    const draft = match.draft;
    if (match.phase === 'draft' && draft?.status === 'selecting' && draft.turnAccountId) {
      const accountId = draft.turnAccountId;
      const remaining = Math.max(0, (draft.selectionDeadlineAt ?? now) - now);
      match.draftTimer = setTimeout(
        () => this.makeAutomaticDraftPick(match.matchId, accountId, 'selection-timeout'),
        remaining
      );
      match.draftTimer.unref?.();
      if (match.participants.find(item => item.identity.accountId === accountId)?.simulated) {
        match.simulatedDraftTimer = setTimeout(
          () => this.makeAutomaticDraftPick(match.matchId, accountId, 'simulated-selection'),
          Math.min(this.options.simulatedDraftPickDelayMs, remaining)
        );
        match.simulatedDraftTimer.unref?.();
      }
      return;
    }
    if (match.phase === 'draft' && draft?.status === 'finalizing' && draft.finalRevealAt !== null) {
      const revealAt = draft.finalRevealAt;
      match.draftTimer = setTimeout(
        () => this.revealFinalRandomSelection(match.matchId, revealAt),
        Math.max(0, revealAt - now)
      );
      match.draftTimer.unref?.();
      return;
    }
    if (match.phase === 'countdown' && match.countdownEndsAt !== null) {
      const startAt = match.countdownEndsAt;
      match.countdownTimer = setTimeout(
        () => this.startRunningMatch(match.matchId, startAt),
        Math.max(0, startAt - now)
      );
      match.countdownTimer.unref?.();
      return;
    }
    if (match.phase === 'running' && match.drawProposal) {
      this.armDrawProposalTimeout(match, match.drawProposal);
    }
  }

  private enqueuePersistence(operation: () => Promise<void>, onSuccess?: () => void): void {
    this.persistenceQueue = this.persistenceQueue
      .then(async () => {
        if (this.persistenceError) throw this.persistenceError;
        await operation();
      })
      .then(() => onSuccess?.())
      .catch(error => this.reportPersistenceError(error));
  }

  private reportPersistenceError(value: unknown): void {
    const error = value instanceof Error ? value : new Error(String(value));
    const firstFailure = this.persistenceError === null;
    this.persistenceError = error;
    this.options.onPersistenceError?.(error);
    if (!firstFailure) return;
    const message: GatewayServerMessage = {
      type: 'ERROR',
      code: 'MATCH_AUTHORITY_PERSISTENCE_UNAVAILABLE',
      message: 'The durable Match authority is temporarily unavailable. No uncommitted transition was published.',
      recoverable: false
    };
    for (const match of this.matches.values()) {
      for (const participant of match.participants) {
        if (!participant.simulated && participant.connected) participant.send(message);
      }
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
        simulated: participant.simulated,
        avatarSource: participant.identity.avatarSource ?? 'discord',
        avatarUrl: participant.identity.avatarUrl ?? null,
        skribblAvatar: participant.identity.skribblAvatar ?? null,
        specialAvatarId: participant.identity.specialAvatarId ?? null,
        invisibleAvatarEntitled: participant.identity.invisibleAvatarEntitled === true
      })),
      readyDeadlineAt: match.readyDeadlineAt,
      countdownEndsAt: match.countdownEndsAt,
      startedAt: match.startedAt,
      startingAccountId: match.startingAccountId,
      createdAt: match.createdAt,
      claims: match.claims.map(claim => ({ ...claim })),
      drawProposal: match.drawProposal ? { ...match.drawProposal } : null,
      conclusion: match.conclusion ? { ...match.conclusion } : null,
      rematchReadyAccountIds: [...match.rematchReadyAccountIds],
      departedAccountIds: [...match.departedAccountIds],
      draft: match.draft ? {
        status: match.draft.status,
        requiredPickCount: match.draft.requiredPickCount,
        playerPickCount: match.draft.playerPickCount,
        turnAccountId: match.draft.turnAccountId,
        selectionDeadlineAt: match.draft.selectionDeadlineAt,
        picks: match.draft.picks.map(pick => ({ ...pick })),
        offeredChallengeIds: [...match.draft.offeredChallengeIds],
        finalCandidateChallengeIds: [...match.draft.finalCandidateChallengeIds],
        finalRevealAt: match.draft.finalRevealAt,
        board: match.draft.board ? structuredClone(match.draft.board) : null
      } : null
    };
  }

  private asParticipant(peer: MatchmakingPeer, simulated: boolean): MatchParticipant {
    return {
      ...peer,
      ready: false,
      simulated,
      connected: true,
      reconnectTimer: null,
      chatSpam: emptyDuelChatSpamState(),
      claimSubmittedAt: []
    };
  }

  private createSimulatedPeer(): MatchParticipant {
    const suffix = this.createId();
    const displayName = SIMULATED_NAMES[this.simulatedNameIndex % SIMULATED_NAMES.length]!;
    this.simulatedNameIndex += 1;
    return {
      identity: {
        accountId: `simulated-${suffix}`,
        displayName,
        discordUserId: null,
        discordUsername: displayName,
        avatarSource: 'skribbl',
        avatarUrl: null,
        skribblAvatar: [this.simulatedNameIndex % 16, 0, 0, -1],
        specialAvatarId: null,
        invisibleAvatarEntitled: false,
        preferredLanguage: 'en'
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
      connected: true,
      reconnectTimer: null,
      chatSpam: emptyDuelChatSpamState(),
      claimSubmittedAt: [],
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
