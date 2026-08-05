import * as assert from 'node:assert/strict';
import {
  GATEWAY_CONTRACT_VERSION,
  isGatewayClientMessage,
  isGatewayServerMessage
} from '@skribbl-duels/gateway-contracts';

const hello = {
  type: 'HELLO',
  contractVersion: GATEWAY_CONTRACT_VERSION,
  clientVersion: '0.42.0',
  capabilities: ['skribbl-telemetry']
} as const;

assert.equal(GATEWAY_CONTRACT_VERSION, 3);
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
      { accountId: 'a', displayName: 'Alpha', ready: false, simulated: false },
      { accountId: 'b', displayName: 'Bot', ready: true, simulated: true }
    ],
    readyDeadlineAt: 31_000,
    countdownEndsAt: null,
    startedAt: null,
    startingAccountId: 'a',
    createdAt: 1_000,
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
      { accountId: 'a', displayName: 'Alpha', ready: true, simulated: false },
      { accountId: 'b', displayName: 'Bot', ready: true, simulated: true }
    ],
    readyDeadlineAt: null,
    countdownEndsAt: null,
    startedAt: null,
    startingAccountId: 'a',
    createdAt: 1_000,
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
  accepted: true,
  claimId: 'claim-1',
  reason: null,
  revision: 1
}), true);
assert.equal(isGatewayServerMessage({ type: 'TELEMETRY_BATCH' }), false);

console.log(JSON.stringify({
  contractVersion: GATEWAY_CONTRACT_VERSION,
  strictClientAndServerGuards: true,
  tokenFreeHello: true
}, null, 2));
