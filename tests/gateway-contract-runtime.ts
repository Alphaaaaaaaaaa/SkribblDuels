import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GATEWAY_CONTRACT_VERSION,
  isGatewayClientMessage,
  isGatewayServerMessage
} from '@skribbl-duels/gateway-contracts';

const hello = {
  type: 'HELLO',
  contractVersion: GATEWAY_CONTRACT_VERSION,
  clientVersion: '0.47.0',
  capabilities: ['skribbl-telemetry']
} as const;

assert.equal(GATEWAY_CONTRACT_VERSION, 5);
assert.equal(isGatewayClientMessage(hello), true);
assert.equal('accessToken' in hello, false);
assert.equal(isGatewayClientMessage({ ...hello, clientVersion: '' }), false);
assert.equal(isGatewayClientMessage({ ...hello, capabilities: ['unknown'] }), false);
assert.equal(isGatewayClientMessage({ ...hello, resumeMatchId: 'match-1', lastServerRevision: 12 }), true);
assert.equal(isGatewayClientMessage({ ...hello, resumeMatchId: 'match-1', lastServerRevision: -1 }), false);
assert.equal(isGatewayClientMessage({ type: 'WELCOME' }), false);
assert.equal(isGatewayClientMessage({
  type: 'MATCHMAKING_JOIN',
  requestId: 'queue-1',
  format: 'ranked',
  page: 'home'
}), true);
assert.equal(isGatewayClientMessage({
  type: 'MATCHMAKING_JOIN',
  requestId: 'queue-1',
  format: 'ranked',
  page: 'game'
}), false);
const telemetryEvent = JSON.parse(readFileSync(
  'fixtures/starter-challenges-with-typo-guess-challenges-v30.fixture.json',
  'utf8'
)).events[0].event;
assert.equal(isGatewayClientMessage({
  type: 'TELEMETRY_BATCH',
  matchId: 'match-1',
  firstSequence: 1,
  lastSequence: 1,
  envelopes: [{
    contractVersion: 1,
    matchId: 'match-1',
    sequence: 1,
    sentAt: telemetryEvent.occurredAt,
    event: telemetryEvent
  }]
}), true);
assert.equal(isGatewayClientMessage({
  type: 'TELEMETRY_BATCH',
  matchId: 'match-1',
  firstSequence: 1,
  lastSequence: 2,
  envelopes: []
}), false);
assert.equal(isGatewayClientMessage({
  type: 'CLAIM_CANDIDATE',
  matchId: 'match-1',
  candidateId: 'candidate-1',
  challengeId: 'quickscope',
  definitionVersion: 1,
  evidenceEventIds: ['event-1'],
  occurredAt: 1_500,
  throughSequence: 3
}), true);
assert.equal(isGatewayClientMessage({
  type: 'DRAFT_PICK',
  matchId: 'match-1',
  challengeId: 'blind-guess',
  clientRevision: 4
}), true);
assert.equal(isGatewayClientMessage({
  type: 'DRAFT_PICK',
  matchId: 'match-1',
  challengeId: 'blind-guess',
  clientRevision: -1
}), false);
assert.equal(isGatewayServerMessage({
  type: 'WELCOME',
  contractVersion: GATEWAY_CONTRACT_VERSION,
  connectionId: 'connection-1',
  identity: { accountId: 'a', displayName: 'Alpha', discordUserId: null },
  serverTime: 1_000,
  heartbeatIntervalMs: 25_000,
  resumeStatus: 'resumed',
  resumedMatchId: 'match-1'
}), true);
assert.equal(isGatewayServerMessage({
  type: 'WELCOME',
  contractVersion: GATEWAY_CONTRACT_VERSION,
  connectionId: 'connection-1',
  identity: { accountId: 'a', displayName: 'Alpha', discordUserId: null },
  serverTime: 1_000,
  heartbeatIntervalMs: 25_000,
  resumeStatus: 'resumed',
  resumedMatchId: null
}), false);
assert.equal(isGatewayServerMessage({
  type: 'MATCH_SNAPSHOT',
  matchId: 'match-1',
  revision: 1,
  state: {
    format: 'ranked',
    phase: 'ready-check',
    participants: [
      { accountId: 'a', displayName: 'Alpha', ready: false, simulated: false, avatarSource: 'discord', avatarUrl: null, skribblAvatar: null, specialAvatarId: null },
      { accountId: 'b', displayName: 'Bot', ready: true, simulated: true, avatarSource: 'skribbl', avatarUrl: null, skribblAvatar: [1, 2, 3, -1], specialAvatarId: null }
    ],
    readyDeadlineAt: 31_000,
    countdownEndsAt: null,
    startedAt: null,
    startingAccountId: 'a',
    createdAt: 1_000,
    claims: [],
    winnerAccountId: null,
    finishedAt: null,
    draft: null
  }
}), true);
assert.equal(isGatewayServerMessage({
  type: 'MATCH_SNAPSHOT',
  matchId: 'match-1',
  revision: 2,
  state: {
    format: 'casual',
    phase: 'draft',
    participants: [
      { accountId: 'a', displayName: 'Alpha', ready: true, simulated: false, avatarSource: 'discord', avatarUrl: null, skribblAvatar: null, specialAvatarId: null },
      { accountId: 'b', displayName: 'Bot', ready: true, simulated: true, avatarSource: 'skribbl', avatarUrl: null, skribblAvatar: [1, 2, 3, -1], specialAvatarId: null }
    ],
    readyDeadlineAt: null,
    countdownEndsAt: null,
    startedAt: null,
    startingAccountId: 'a',
    createdAt: 1_000,
    claims: [],
    winnerAccountId: null,
    finishedAt: null,
    draft: {
      status: 'selecting',
      requiredPickCount: 9,
      playerPickCount: 8,
      turnAccountId: 'a',
      selectionDeadlineAt: 16_000,
      picks: [],
      offeredChallengeIds: ['blind-guess', 'deaf-guess'],
      finalCandidateChallengeIds: [],
      finalRevealAt: null,
      board: null
    }
  }
}), true);
assert.equal(isGatewayServerMessage({
  type: 'CLAIM_RESOLUTION',
  matchId: 'match-1',
  candidateId: 'candidate-1',
  challengeId: 'challenge-1',
  definitionVersion: 1,
  ownerAccountId: 'a',
  accepted: true,
  claimId: 'claim-1',
  reason: null,
  revision: 1,
  occurredAt: 1_500
}), true);
assert.equal(isGatewayServerMessage({ type: 'TELEMETRY_BATCH' }), false);

console.log(JSON.stringify({
  contractVersion: GATEWAY_CONTRACT_VERSION,
  strictClientAndServerGuards: true,
  tokenFreeHello: true
}, null, 2));
