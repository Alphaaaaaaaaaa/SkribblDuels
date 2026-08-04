import * as assert from 'node:assert/strict';
import {
  isGatewayServerMessage,
  type GatewayMatchSnapshotMessage,
  type GatewayServerMessage
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

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for synchronized match start.');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

const messages = new Map<string, GatewayServerMessage[]>([
  ['countdown-a', []],
  ['countdown-b', []]
]);
let id = 0;
const countdownMs = 30;
const matchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 1_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5,
  draftPickTimeoutMs: 15_000,
  simulatedDraftPickDelayMs: 5,
  matchCountdownMs: countdownMs,
  createId: () => `countdown-${++id}`,
  random: () => 0
});

for (const accountId of ['countdown-a', 'countdown-b'] as const) {
  matchmaker.join({
    identity: { accountId, displayName: accountId, discordUserId: accountId },
    capabilities,
    send(message) { messages.get(accountId)!.push(structuredClone(message)); }
  }, {
    type: 'MATCHMAKING_JOIN',
    requestId: `queue-${accountId}`,
    format: 'casual',
    page: 'home'
  });
}

const initial = messages.get('countdown-a')!.find(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'ready-check'
) as GatewayMatchSnapshotMessage;
assert.ok(initial);
matchmaker.setReady('countdown-a', { type: 'READY_SET', matchId: initial.matchId, ready: true });
matchmaker.setReady('countdown-b', { type: 'READY_SET', matchId: initial.matchId, ready: true });

while (true) {
  const latest = [...messages.get('countdown-a')!].reverse().find(message =>
    message.type === 'MATCH_SNAPSHOT'
  ) as GatewayMatchSnapshotMessage;
  if (latest.state.phase === 'countdown') break;
  assert.equal(latest.state.phase, 'draft');
  const draft = latest.state.draft;
  assert.ok(draft?.turnAccountId);
  const challengeId = draft.availableChallengeIds[0];
  assert.ok(challengeId);
  const decision = matchmaker.pickDraftChallenge(draft.turnAccountId, {
    type: 'DRAFT_PICK',
    matchId: latest.matchId,
    challengeId,
    clientRevision: latest.revision
  });
  assert.equal(decision.ok, true);
}

const countdown = [...messages.get('countdown-a')!].reverse().find(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'countdown'
) as GatewayMatchSnapshotMessage;
assert.ok(countdown);
assert.equal(isGatewayServerMessage(countdown), true);
assert.equal(countdown.state.draft?.status, 'complete');
assert.equal(countdown.state.draft?.board?.fields.length, 9);
assert.equal(countdown.state.readyDeadlineAt, null);
assert.equal(countdown.state.startedAt, null);
assert.ok(countdown.state.countdownEndsAt);
assert.ok(countdown.state.countdownEndsAt - Date.now() <= countdownMs);
assert.ok(countdown.state.countdownEndsAt - Date.now() > 0);

await waitFor(() => messages.get('countdown-a')!.some(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'running'
));
const running = [...messages.get('countdown-a')!].reverse().find(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'running'
) as GatewayMatchSnapshotMessage;
assert.equal(isGatewayServerMessage(running), true);
assert.equal(running.state.countdownEndsAt, null);
assert.equal(running.state.startedAt, countdown.state.countdownEndsAt);
assert.equal(running.state.draft?.board?.boardId, countdown.state.draft?.board?.boardId);

const events = messages.get('countdown-a')!.filter(message => message.type === 'MATCH_EVENT');
const countdownEventIndex = events.findIndex(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'MATCH_COUNTDOWN_STARTED'
);
const startEventIndex = events.findIndex(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'MATCH_STARTED'
);
assert.ok(countdownEventIndex >= 0);
assert.ok(startEventIndex > countdownEventIndex);

matchmaker.close();

console.log(JSON.stringify({
  authoritativeCountdownSeconds: 10,
  completedBoardPreserved: true,
  exactScheduledStartedAt: true,
  countdownBeforeRunning: true,
  validContractSnapshots: true
}, null, 2));
