import * as assert from 'node:assert/strict';
import type {
  GatewayClientIdentity,
  GatewayMatchSnapshotMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import {
  GatewayMatchmaker,
  type MatchmakingPeer
} from '../apps/gateway/src/matchmaking';

function peer(
  identity: GatewayClientIdentity,
  messages: GatewayServerMessage[]
): MatchmakingPeer {
  return {
    identity,
    capabilities: ['skribbl-telemetry'],
    send: message => messages.push(structuredClone(message))
  };
}

function latestMatch(messages: readonly GatewayServerMessage[]): GatewayMatchSnapshotMessage {
  const match = messages.filter(
    (message): message is GatewayMatchSnapshotMessage => message.type === 'MATCH_SNAPSHOT'
  ).at(-1);
  assert.ok(match);
  return match;
}

const alpha = { accountId: 'alpha', displayName: 'Alpha', discordUserId: 'discord-alpha' };
const beta = { accountId: 'beta', displayName: 'Beta', discordUserId: 'discord-beta' };
const alphaMessages: GatewayServerMessage[] = [];
const betaMessages: GatewayServerMessage[] = [];
const resumedMessages: GatewayServerMessage[] = [];
let nextId = 0;

const matchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 1_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 1_000,
  simulatedReadyDelayMs: 1_000,
  draftPickTimeoutMs: 1_000,
  simulatedDraftPickDelayMs: 1_000,
  draftFinalRevealMs: 8,
  matchCountdownMs: 10_000,
  reconnectGraceMs: 30,
  random: () => 0,
  createId: () => `reconnect-${++nextId}`
});

matchmaker.join(peer(alpha, alphaMessages), {
  type: 'MATCHMAKING_JOIN',
  requestId: 'queue-alpha',
  format: 'casual',
  page: 'home'
});
matchmaker.join(peer(beta, betaMessages), {
  type: 'MATCHMAKING_JOIN',
  requestId: 'queue-beta',
  format: 'casual',
  page: 'home'
});

const initial = latestMatch(alphaMessages);
matchmaker.disconnect(alpha.accountId);
assert.deepEqual(matchmaker.resume(peer(alpha, resumedMessages), 'wrong-match'), {
  status: 'mismatch',
  matchId: null
});
assert.deepEqual(matchmaker.resume(peer(alpha, resumedMessages), initial.matchId), {
  status: 'resumed',
  matchId: initial.matchId
});
matchmaker.publishResumeSnapshot(alpha.accountId);
const restored = latestMatch(resumedMessages);
assert.equal(restored.matchId, initial.matchId);
assert.equal(restored.revision, initial.revision);
assert.deepEqual(restored.state, initial.state);

matchmaker.disconnect(alpha.accountId);
await new Promise(resolve => setTimeout(resolve, 60));
const cancelled = latestMatch(betaMessages);
assert.equal(cancelled.state.phase, 'cancelled');
const aborted = betaMessages.find(message =>
  message.type === 'MATCH_EVENT'
  && message.matchId === initial.matchId
  && message.event.type === 'MATCH_ABORTED'
);
assert.ok(aborted);
if (aborted?.type === 'MATCH_EVENT') {
  assert.equal(aborted.event.reason, 'player-reconnect-timeout');
}
assert.deepEqual(matchmaker.resume(peer(alpha, resumedMessages), initial.matchId), {
  status: 'not-found',
  matchId: null
});

matchmaker.close();
console.log('Gateway reconnect grace, exact-match resume and timeout cleanup passed.');
