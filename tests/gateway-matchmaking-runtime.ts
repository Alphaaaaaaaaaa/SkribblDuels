import * as assert from 'node:assert/strict';
import type {
  GatewayMatchSnapshotMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { GatewayMatchmaker } from '../apps/gateway/src/matchmaking';

const capabilities = [
  'skribbl-telemetry',
  'official-word-list',
  'typo',
  'typo-challenges',
  'typo-drops',
  'typo-image-lab'
] as const;

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for matchmaking state.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const messages: GatewayServerMessage[] = [];
let id = 0;
const matchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 80,
  simulatedPlayersEnabled: true,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5,
  draftPickTimeoutMs: 1_000,
  simulatedDraftPickDelayMs: 5,
  draftFinalRevealMs: 8,
  matchCountdownMs: 10_000,
  createId: () => String(++id),
  random: () => 0
});
const peer = {
  identity: {
    accountId: 'account-alpha',
    displayName: 'analphabetism',
    discordUserId: '459399117307904000'
  },
  capabilities,
  send(message: GatewayServerMessage) {
    messages.push(structuredClone(message));
  }
};

matchmaker.join(peer, {
  type: 'MATCHMAKING_JOIN',
  requestId: 'queue-1',
  format: 'ranked',
  page: 'home'
});
await waitFor(() => messages.some(message =>
  message.type === 'MATCH_SNAPSHOT'
  && message.state.phase === 'ready-check'
  && message.state.participants.some(participant => participant.simulated && participant.ready)
));
const firstSnapshot = [...messages].reverse().find(
  message => message.type === 'MATCH_SNAPSHOT'
) as GatewayMatchSnapshotMessage;
assert.equal(firstSnapshot.state.participants.length, 2);
assert.equal(firstSnapshot.state.readyDeadlineAt! - firstSnapshot.state.createdAt, 80);
assert.equal(firstSnapshot.state.startingAccountId, 'account-alpha');
assert.equal(matchmaker.setReady('account-alpha', {
  type: 'READY_SET',
  matchId: firstSnapshot.matchId,
  ready: true
}).ok, true);
await waitFor(() => messages.some(message =>
  message.type === 'MATCH_SNAPSHOT'
  && message.matchId === firstSnapshot.matchId
  && message.state.phase === 'draft'
));

matchmaker.join(peer, {
  type: 'MATCHMAKING_JOIN',
  requestId: 'queue-2',
  format: 'casual',
  page: 'home'
});
assert.ok(messages.some(message =>
  message.type === 'MATCH_EVENT'
  && message.matchId === firstSnapshot.matchId
  && message.event.type === 'MATCH_ABORTED'
  && message.event.reason === 'superseded-by-new-matchmaking'
));
await waitFor(() => messages.some(message =>
  message.type === 'MATCH_SNAPSHOT'
  && message.matchId !== firstSnapshot.matchId
  && message.state.phase === 'ready-check'
));
const secondSnapshot = [...messages].reverse().find(message =>
  message.type === 'MATCH_SNAPSHOT' && message.matchId !== firstSnapshot.matchId
) as GatewayMatchSnapshotMessage;
await waitFor(() => messages.some(message =>
  message.type === 'MATCH_EVENT'
  && message.matchId === secondSnapshot.matchId
  && message.event.type === 'READY_CHECK_EXPIRED'
));
assert.ok(messages.some(message =>
  message.type === 'MATCH_SNAPSHOT'
  && message.matchId === secondSnapshot.matchId
  && message.state.phase === 'cancelled'
));

matchmaker.close();

const realMessages = new Map<string, GatewayServerMessage[]>([
  ['account-a', []],
  ['account-b', []]
]);
const realMatchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 200,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5,
  draftPickTimeoutMs: 1_000,
  simulatedDraftPickDelayMs: 5,
  draftFinalRevealMs: 8,
  matchCountdownMs: 10_000,
  createId: () => `real-${++id}`,
  random: () => 0.75
});
for (const [accountId, displayName] of [['account-a', 'Alpha'], ['account-b', 'Bravo']] as const) {
  realMatchmaker.join({
    identity: { accountId, displayName, discordUserId: accountId },
    capabilities,
    send(message) { realMessages.get(accountId)!.push(structuredClone(message)); }
  }, {
    type: 'MATCHMAKING_JOIN',
    requestId: `queue-${accountId}`,
    format: 'casual',
    page: 'home'
  });
}
const realSnapshotA = realMessages.get('account-a')!.find(
  message => message.type === 'MATCH_SNAPSHOT'
) as GatewayMatchSnapshotMessage;
const realSnapshotB = realMessages.get('account-b')!.find(
  message => message.type === 'MATCH_SNAPSHOT'
) as GatewayMatchSnapshotMessage;
assert.equal(realSnapshotA.matchId, realSnapshotB.matchId);
assert.equal(realSnapshotA.state.participants.every(participant => !participant.simulated), true);
assert.equal(realSnapshotA.state.startingAccountId, 'account-b');
realMatchmaker.setReady('account-a', { type: 'READY_SET', matchId: realSnapshotA.matchId, ready: true });
realMatchmaker.setReady('account-b', { type: 'READY_SET', matchId: realSnapshotA.matchId, ready: true });
assert.ok(realMessages.get('account-a')!.some(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'draft'
));
realMatchmaker.close();

console.log(JSON.stringify({
  homepageQueue: true,
  realTwoPlayerPairing: true,
  simulatedOpponent: true,
  readyCheckSeconds: 30,
  randomDraftStarter: true,
  supersededMatchAborted: true,
  readyTimeoutCancels: true
}, null, 2));
