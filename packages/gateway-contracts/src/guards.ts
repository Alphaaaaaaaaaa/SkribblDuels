import { isTelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import {
  GATEWAY_CONTRACT_VERSION,
  type GatewayAuthRequiredMessage,
  type GatewayClientCapability,
  type GatewayClientMessage,
  type GatewayDraftState,
  type GatewayErrorMessage,
  type GatewayHelloMessage,
  type GatewayServerMessage
} from './types';

const CLIENT_CAPABILITIES = new Set<GatewayClientCapability>([
  'skribbl-telemetry',
  'official-word-list',
  'typo',
  'typo-challenges',
  'typo-drops',
  'typo-image-lab'
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function nonEmptyCodePointString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && Array.from(value).length <= maxLength;
}

function optionalString(value: unknown, maxLength = 256): value is string | undefined {
  return value === undefined || nonEmptyString(value, maxLength);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function stringArray(value: unknown, maxItems = 256): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(item => nonEmptyString(item));
}

function nullableString(value: unknown, maxLength = 2048): boolean {
  return value === null || nonEmptyString(value, maxLength);
}

function skribblAvatar(value: unknown): boolean {
  return value === null || (Array.isArray(value)
    && value.length === 4
    && value.every(item => Number.isInteger(item) && Number(item) >= -255 && Number(item) <= 255));
}

function matchmakingParticipant(value: unknown): boolean {
  const participant = record(value);
  return Boolean(participant
    && nonEmptyString(participant.accountId)
    && nonEmptyString(participant.displayName, 128)
    && typeof participant.ready === 'boolean'
    && typeof participant.simulated === 'boolean'
    && (participant.avatarSource === 'discord' || participant.avatarSource === 'skribbl')
    && nullableString(participant.avatarUrl)
    && skribblAvatar(participant.skribblAvatar)
    && nullableString(participant.specialAvatarId, 64)
    && typeof participant.invisibleAvatarEntitled === 'boolean');
}

function drawProposal(value: unknown): boolean {
  const proposal = record(value);
  return Boolean(proposal
    && nonEmptyString(proposal.proposalId)
    && nonEmptyString(proposal.proposerAccountId)
    && finiteNumber(proposal.createdAt)
    && finiteNumber(proposal.expiresAt)
    && Number(proposal.expiresAt) > Number(proposal.createdAt));
}

function matchConclusion(value: unknown): boolean {
  const conclusion = record(value);
  return Boolean(conclusion
    && (conclusion.outcome === 'win' || conclusion.outcome === 'draw')
    && (conclusion.reason === 'win-target-reached'
      || conclusion.reason === 'player-forfeit'
      || conclusion.reason === 'mutual-draw')
    && (conclusion.winnerAccountId === null || nonEmptyString(conclusion.winnerAccountId))
    && (conclusion.loserAccountId === null || nonEmptyString(conclusion.loserAccountId))
    && (conclusion.initiatedByAccountId === null || nonEmptyString(conclusion.initiatedByAccountId))
    && finiteNumber(conclusion.occurredAt));
}

function draftPick(value: unknown): boolean {
  const pick = record(value);
  return Boolean(pick
    && nonNegativeInteger(pick.pickNumber)
    && (pick.accountId === null || nonEmptyString(pick.accountId))
    && nonEmptyString(pick.challengeId)
    && nonNegativeInteger(pick.definitionVersion)
    && typeof pick.automatic === 'boolean'
    && (pick.source === 'player'
      || pick.source === 'selection-timeout'
      || pick.source === 'simulated-selection'
      || pick.source === 'server-random')
    && finiteNumber(pick.pickedAt));
}

function draftBoardField(value: unknown): boolean {
  const field = record(value);
  return Boolean(field
    && nonNegativeInteger(field.fieldIndex)
    && nonEmptyString(field.challengeId)
    && nonNegativeInteger(field.definitionVersion));
}

function draftBoard(value: unknown): boolean {
  const board = record(value);
  if (!board
      || !nonEmptyString(board.boardId)
      || (board.format !== 'casual' && board.format !== 'ranked')
      || (board.size !== 9 && board.size !== 25)
      || (board.winTarget !== 5 && board.winTarget !== 13)
      || !nonNegativeInteger(board.seed)
      || !finiteNumber(board.createdAt)
      || !Array.isArray(board.fields)
      || !board.fields.every(draftBoardField)
      || board.manifestVersion !== 1) return false;
  return board.fields.length === board.size;
}

function draftState(value: unknown): value is GatewayDraftState {
  const draft = record(value);
  if (!draft
      || (draft.status !== 'selecting' && draft.status !== 'finalizing' && draft.status !== 'complete')
      || (draft.requiredPickCount !== 9 && draft.requiredPickCount !== 25)
      || (draft.playerPickCount !== 8 && draft.playerPickCount !== 24)
      || draft.playerPickCount !== draft.requiredPickCount - 1
      || (draft.turnAccountId !== null && !nonEmptyString(draft.turnAccountId))
      || (draft.selectionDeadlineAt !== null && !finiteNumber(draft.selectionDeadlineAt))
      || !Array.isArray(draft.picks)
      || draft.picks.length > draft.requiredPickCount
      || !draft.picks.every(draftPick)
      || !stringArray(draft.offeredChallengeIds, 2)
      || !stringArray(draft.finalCandidateChallengeIds, 64)
      || (draft.finalRevealAt !== null && !finiteNumber(draft.finalRevealAt))
      || (draft.board !== null && !draftBoard(draft.board))) return false;
  if (draft.status === 'selecting') {
    return nonEmptyString(draft.turnAccountId)
      && finiteNumber(draft.selectionDeadlineAt)
      && draft.picks.length < draft.playerPickCount
      && draft.offeredChallengeIds.length === 2
      && new Set(draft.offeredChallengeIds).size === 2
      && draft.finalCandidateChallengeIds.length === 0
      && draft.finalRevealAt === null
      && draft.board === null;
  }
  if (draft.status === 'finalizing') {
    return draft.turnAccountId === null
      && draft.selectionDeadlineAt === null
      && draft.picks.length === draft.playerPickCount
      && draft.offeredChallengeIds.length === 0
      && draft.finalCandidateChallengeIds.length > 0
      && finiteNumber(draft.finalRevealAt)
      && draft.board === null;
  }
  return draft.turnAccountId === null
    && draft.selectionDeadlineAt === null
    && draft.picks.length === draft.requiredPickCount
    && draft.offeredChallengeIds.length === 0
    && draft.finalCandidateChallengeIds.length === 0
    && draft.finalRevealAt === null
    && draft.board !== null;
}

function authoritativeClaim(value: unknown): boolean {
  const claim = record(value);
  return Boolean(claim
    && nonEmptyString(claim.claimId)
    && nonEmptyString(claim.candidateId)
    && nonEmptyString(claim.challengeId)
    && nonNegativeInteger(claim.definitionVersion)
    && nonEmptyString(claim.ownerAccountId)
    && finiteNumber(claim.occurredAt)
    && nonNegativeInteger(claim.revision));
}

function telemetryEnvelope(value: unknown, matchId: string, sequence: number): boolean {
  const envelope = record(value);
  return Boolean(envelope
    && envelope.contractVersion === 1
    && envelope.matchId === matchId
    && envelope.sequence === sequence
    && finiteNumber(envelope.sentAt)
    && isTelemetryEvent(envelope.event));
}

function matchmakingState(value: unknown): boolean {
  const state = record(value);
  if (!state
      || (state.format !== 'casual' && state.format !== 'ranked')
      || (state.phase !== 'ready-check'
        && state.phase !== 'draft'
        && state.phase !== 'countdown'
        && state.phase !== 'running'
        && state.phase !== 'finished'
        && state.phase !== 'cancelled')
      || !Array.isArray(state.participants)
      || state.participants.length !== 2
      || !state.participants.every(matchmakingParticipant)
      || (state.readyDeadlineAt !== null && !finiteNumber(state.readyDeadlineAt))
      || (state.countdownEndsAt !== null && !finiteNumber(state.countdownEndsAt))
      || (state.startedAt !== null && !finiteNumber(state.startedAt))
      || !nonEmptyString(state.startingAccountId)
      || !finiteNumber(state.createdAt)
      || !Array.isArray(state.claims)
      || !state.claims.every(authoritativeClaim)
      || !stringArray(state.rematchReadyAccountIds, 2)
      || (state.drawProposal !== null && !drawProposal(state.drawProposal))
      || (state.conclusion !== null && !matchConclusion(state.conclusion))) return false;
  const participantIds = new Set((state.participants as Array<Record<string, unknown>>)
    .map(participant => participant.accountId));
  if ((state.claims as Array<Record<string, unknown>>).some(claim =>
    !participantIds.has(claim.ownerAccountId))) return false;
  if ((state.rematchReadyAccountIds as string[]).some(accountId => !participantIds.has(accountId))
      || new Set(state.rematchReadyAccountIds as string[]).size !== state.rematchReadyAccountIds.length) return false;
  if (state.drawProposal !== null) {
    const proposal = state.drawProposal as Record<string, unknown>;
    if (!participantIds.has(proposal.proposerAccountId)) return false;
  }
  if (state.conclusion !== null) {
    const conclusion = state.conclusion as Record<string, unknown>;
    if (conclusion.initiatedByAccountId !== null
        && !participantIds.has(conclusion.initiatedByAccountId)) return false;
    if (conclusion.outcome === 'win') {
      if (!nonEmptyString(conclusion.winnerAccountId)
          || !nonEmptyString(conclusion.loserAccountId)
          || conclusion.winnerAccountId === conclusion.loserAccountId
          || !participantIds.has(conclusion.winnerAccountId)
          || !participantIds.has(conclusion.loserAccountId)) return false;
    } else if (conclusion.winnerAccountId !== null || conclusion.loserAccountId !== null) {
      return false;
    }
  }
  if (state.phase === 'draft') {
    return state.readyDeadlineAt === null
      && state.countdownEndsAt === null
      && state.startedAt === null
      && state.drawProposal === null
      && state.conclusion === null
      && state.rematchReadyAccountIds.length === 0
      && state.claims.length === 0
      && (state.draft === undefined || draftState(state.draft));
  }
  if (state.phase === 'countdown') {
    return state.readyDeadlineAt === null
      && finiteNumber(state.countdownEndsAt)
      && state.countdownEndsAt > state.createdAt
      && state.startedAt === null
      && state.drawProposal === null
      && state.conclusion === null
      && state.rematchReadyAccountIds.length === 0
      && state.claims.length === 0
      && draftState(state.draft)
      && state.draft.status === 'complete';
  }
  if (state.phase === 'running') {
    return state.readyDeadlineAt === null
      && state.countdownEndsAt === null
      && finiteNumber(state.startedAt)
      && state.startedAt >= state.createdAt
      && state.conclusion === null
      && state.rematchReadyAccountIds.length === 0
      && (state.drawProposal === null
        || Number((state.drawProposal as Record<string, unknown>).createdAt) >= Number(state.startedAt))
      && draftState(state.draft)
      && state.draft.status === 'complete';
  }
  if (state.phase === 'finished') {
    return state.readyDeadlineAt === null
      && state.countdownEndsAt === null
      && finiteNumber(state.startedAt)
      && state.startedAt >= state.createdAt
      && state.drawProposal === null
      && state.conclusion !== null
      && Number((state.conclusion as Record<string, unknown>).occurredAt) >= Number(state.startedAt)
      && draftState(state.draft)
      && state.draft.status === 'complete';
  }
  return state.countdownEndsAt === null
    && state.startedAt === null
    && state.drawProposal === null
    && state.conclusion === null
    && state.rematchReadyAccountIds.length === 0
    && state.claims.length === 0
    && (state.draft === undefined || state.draft === null);
}

function matchmakingEvent(value: unknown): boolean {
  const event = record(value);
  return Boolean(event
    && (event.type === 'MATCH_ABORTED'
      || event.type === 'READY_CHANGED'
      || event.type === 'READY_CHECK_COMPLETED'
      || event.type === 'READY_CHECK_EXPIRED'
      || event.type === 'DRAFT_STARTED'
      || event.type === 'DRAFT_PICKED'
      || event.type === 'DRAFT_PICK_TIMED_OUT'
      || event.type === 'DRAFT_FINAL_RANDOM_STARTED'
      || event.type === 'DRAFT_FINAL_RANDOM_SELECTED'
      || event.type === 'DRAFT_COMPLETED'
      || event.type === 'MATCH_COUNTDOWN_STARTED'
      || event.type === 'MATCH_STARTED'
      || event.type === 'DRAW_PROPOSED'
      || event.type === 'DRAW_WITHDRAWN'
      || event.type === 'DRAW_REJECTED'
      || event.type === 'DRAW_EXPIRED'
      || event.type === 'MATCH_FORFEITED'
      || event.type === 'MATCH_FINISHED'
      || event.type === 'REMATCH_READY_CHANGED'
      || event.type === 'REMATCH_STARTED')
    && (event.accountId === null || nonEmptyString(event.accountId))
    && (event.reason === null || nonEmptyString(event.reason, 128))
    && (event.challengeId === undefined || nonEmptyString(event.challengeId))
    && (event.pickNumber === undefined || nonNegativeInteger(event.pickNumber))
    && (event.automatic === undefined || typeof event.automatic === 'boolean')
    && (event.proposalId === undefined || nonEmptyString(event.proposalId)));
}

export function isGatewayHelloMessage(value: unknown): value is GatewayHelloMessage {
  const message = record(value);
  return Boolean(message
    && message.type === 'HELLO'
    && message.contractVersion === GATEWAY_CONTRACT_VERSION
    && nonEmptyString(message.clientVersion, 64)
    && Array.isArray(message.capabilities)
    && message.capabilities.length <= CLIENT_CAPABILITIES.size
    && message.capabilities.every(capability => CLIENT_CAPABILITIES.has(capability as GatewayClientCapability))
    && optionalString(message.resumeMatchId)
    && (message.lastServerRevision === undefined || nonNegativeInteger(message.lastServerRevision)));
}

export function isGatewayClientMessage(value: unknown): value is GatewayClientMessage {
  const message = record(value);
  if (!message || typeof message.type !== 'string') return false;
  switch (message.type) {
    case 'HELLO':
      return isGatewayHelloMessage(message);
    case 'MATCHMAKING_JOIN':
      return nonEmptyString(message.requestId)
        && (message.format === 'casual' || message.format === 'ranked')
        && message.page === 'home';
    case 'MATCHMAKING_LEAVE':
      return nonEmptyString(message.requestId);
    case 'READY_SET':
      return nonEmptyString(message.matchId) && typeof message.ready === 'boolean';
    case 'DRAFT_PICK':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.challengeId)
        && nonNegativeInteger(message.clientRevision);
    case 'CLAIM_CANDIDATE':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.candidateId)
        && nonEmptyString(message.challengeId)
        && nonNegativeInteger(message.definitionVersion)
        && stringArray(message.evidenceEventIds)
        && finiteNumber(message.occurredAt)
        && nonNegativeInteger(message.throughSequence);
    case 'TELEMETRY_BATCH': {
      if (!nonEmptyString(message.matchId)
          || !nonNegativeInteger(message.firstSequence)
          || !nonNegativeInteger(message.lastSequence)
          || message.lastSequence < message.firstSequence
          || !Array.isArray(message.envelopes)
          || message.envelopes.length === 0
          || message.envelopes.length > 64
          || message.lastSequence - message.firstSequence + 1 !== message.envelopes.length) return false;
      return message.envelopes.every((envelope, index) =>
        telemetryEnvelope(envelope, message.matchId as string, Number(message.firstSequence) + index));
    }
    case 'DUEL_CHAT_SEND':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.clientMessageId)
        && nonEmptyCodePointString(message.message, 300);
    case 'MATCH_FORFEIT':
    case 'MATCH_REMATCH':
    case 'DRAW_PROPOSE':
      return nonEmptyString(message.matchId) && nonEmptyString(message.actionId);
    case 'DRAW_RESPOND':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.proposalId)
        && nonEmptyString(message.actionId)
        && typeof message.accept === 'boolean';
    case 'DRAW_WITHDRAW':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.proposalId)
        && nonEmptyString(message.actionId);
    case 'PING':
      return finiteNumber(message.sentAt);
    default:
      return false;
  }
}

export function isGatewayServerMessage(value: unknown): value is GatewayServerMessage {
  const message = record(value);
  if (!message || typeof message.type !== 'string') return false;
  switch (message.type) {
    case 'WELCOME': {
      const identity = record(message.identity);
      return message.contractVersion === GATEWAY_CONTRACT_VERSION
        && nonEmptyString(message.connectionId)
        && Boolean(identity
          && nonEmptyString(identity.accountId)
          && nonEmptyString(identity.displayName, 128)
          && (identity.discordUserId === null || nonEmptyString(identity.discordUserId))
          && (identity.invisibleAvatarEntitled === undefined
            || typeof identity.invisibleAvatarEntitled === 'boolean'))
        && finiteNumber(message.serverTime)
        && nonNegativeInteger(message.heartbeatIntervalMs)
        && (message.resumeStatus === 'not-requested'
          || message.resumeStatus === 'resumed'
          || message.resumeStatus === 'not-found'
          || message.resumeStatus === 'mismatch')
        && (message.resumedMatchId === null || nonEmptyString(message.resumedMatchId))
        && (message.resumeStatus === 'resumed') === (message.resumedMatchId !== null);
    }
    case 'AUTH_REQUIRED':
      return message.reason === 'missing-token'
        || message.reason === 'invalid-token'
        || message.reason === 'expired-token';
    case 'QUEUE_STATUS':
      return nonEmptyString(message.requestId)
        && (message.format === 'casual' || message.format === 'ranked')
        && typeof message.queued === 'boolean'
        && (message.position === null || nonNegativeInteger(message.position))
        && (message.joinedAt === null || finiteNumber(message.joinedAt));
    case 'MATCH_SNAPSHOT':
      return nonEmptyString(message.matchId)
        && nonNegativeInteger(message.revision)
        && matchmakingState(message.state);
    case 'MATCH_EVENT':
      return nonEmptyString(message.matchId)
        && nonNegativeInteger(message.revision)
        && matchmakingEvent(message.event);
    case 'CLAIM_RESOLUTION':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.candidateId)
        && nonEmptyString(message.challengeId)
        && nonNegativeInteger(message.definitionVersion)
        && nonEmptyString(message.ownerAccountId)
        && typeof message.accepted === 'boolean'
        && (message.claimId === null || nonEmptyString(message.claimId))
        && (message.reason === null || nonEmptyString(message.reason))
        && nonNegativeInteger(message.revision)
        && finiteNumber(message.occurredAt);
    case 'DUEL_CHAT_MESSAGE':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.messageId)
        && nonEmptyString(message.authorAccountId)
        && nonEmptyString(message.authorDisplayName, 128)
        && nonEmptyCodePointString(message.message, 300)
        && finiteNumber(message.occurredAt);
    case 'TELEMETRY_ACK':
      return nonEmptyString(message.matchId)
        && nonNegativeInteger(message.lastSequence);
    case 'PONG':
      return finiteNumber(message.clientSentAt) && finiteNumber(message.serverTime);
    case 'ERROR':
      return nonEmptyString(message.code, 64)
        && nonEmptyString(message.message, 512)
        && typeof message.recoverable === 'boolean'
        && optionalString(message.requestId);
    default:
      return false;
  }
}

export function isGatewayConnectErrorData(
  value: unknown
): value is GatewayAuthRequiredMessage | GatewayErrorMessage {
  const message = record(value);
  return Boolean(message
    && (message.type === 'AUTH_REQUIRED' || message.type === 'ERROR')
    && isGatewayServerMessage(message));
}
