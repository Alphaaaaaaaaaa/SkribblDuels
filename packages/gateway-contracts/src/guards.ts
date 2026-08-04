import {
  GATEWAY_CONTRACT_VERSION,
  type GatewayAuthRequiredMessage,
  type GatewayClientCapability,
  type GatewayClientMessage,
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

function matchmakingParticipant(value: unknown): boolean {
  const participant = record(value);
  return Boolean(participant
    && nonEmptyString(participant.accountId)
    && nonEmptyString(participant.displayName, 128)
    && typeof participant.ready === 'boolean'
    && typeof participant.simulated === 'boolean');
}

function matchmakingState(value: unknown): boolean {
  const state = record(value);
  return Boolean(state
    && (state.format === 'casual' || state.format === 'ranked')
    && (state.phase === 'ready-check' || state.phase === 'draft' || state.phase === 'cancelled')
    && Array.isArray(state.participants)
    && state.participants.length === 2
    && state.participants.every(matchmakingParticipant)
    && (state.readyDeadlineAt === null || finiteNumber(state.readyDeadlineAt))
    && nonEmptyString(state.startingAccountId)
    && finiteNumber(state.createdAt));
}

function matchmakingEvent(value: unknown): boolean {
  const event = record(value);
  return Boolean(event
    && (event.type === 'MATCH_ABORTED'
      || event.type === 'READY_CHANGED'
      || event.type === 'READY_CHECK_COMPLETED'
      || event.type === 'READY_CHECK_EXPIRED')
    && (event.accountId === null || nonEmptyString(event.accountId))
    && (event.reason === null || nonEmptyString(event.reason, 128)));
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
        && finiteNumber(message.occurredAt);
    case 'TELEMETRY_BATCH':
      return nonEmptyString(message.matchId)
        && nonNegativeInteger(message.firstSequence)
        && nonNegativeInteger(message.lastSequence)
        && message.lastSequence >= message.firstSequence
        && Array.isArray(message.envelopes)
        && message.envelopes.length <= 500;
    case 'DUEL_CHAT_SEND':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.clientMessageId)
        && nonEmptyString(message.message, 300);
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
          && (identity.discordUserId === null || nonEmptyString(identity.discordUserId)))
        && finiteNumber(message.serverTime)
        && nonNegativeInteger(message.heartbeatIntervalMs);
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
        && typeof message.accepted === 'boolean'
        && (message.claimId === null || nonEmptyString(message.claimId))
        && (message.reason === null || nonEmptyString(message.reason))
        && nonNegativeInteger(message.revision);
    case 'DUEL_CHAT_MESSAGE':
      return nonEmptyString(message.matchId)
        && nonEmptyString(message.messageId)
        && nonEmptyString(message.authorAccountId)
        && nonEmptyString(message.authorDisplayName, 128)
        && nonEmptyString(message.message, 300)
        && finiteNumber(message.occurredAt);
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
