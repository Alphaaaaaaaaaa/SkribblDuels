import * as assert from 'node:assert/strict';
import type {
  GatewayMatchSnapshotMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { isGatewayServerMessage } from '@skribbl-duels/gateway-contracts';
import { GatewayMatchmaker } from '../apps/gateway/src/matchmaking';

const capabilities = [
  'skribbl-telemetry',
  'official-word-list',
  'typo',
  'typo-challenges',
  'typo-drops',
  'typo-image-lab'
] as const;

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for authoritative draft state.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function latestDraft(messages: readonly GatewayServerMessage[]): GatewayMatchSnapshotMessage {
  const snapshot = [...messages].reverse().find(message =>
    message.type === 'MATCH_SNAPSHOT' && message.state.draft !== null && message.state.draft !== undefined
  );
  assert.ok(snapshot && snapshot.type === 'MATCH_SNAPSHOT');
  return snapshot;
}

let id = 0;
const messages = new Map<string, GatewayServerMessage[]>([
  ['account-a', []],
  ['account-b', []]
]);
const matchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 1_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5,
  draftPickTimeoutMs: 15_000,
  simulatedDraftPickDelayMs: 5,
  matchCountdownMs: 10_000,
  createId: () => `draft-${++id}`,
  random: () => 0
});

for (const [accountId, displayName] of [['account-a', 'Alpha'], ['account-b', 'Bravo']] as const) {
  matchmaker.join({
    identity: { accountId, displayName, discordUserId: accountId },
    capabilities,
    send(message) { messages.get(accountId)!.push(structuredClone(message)); }
  }, {
    type: 'MATCHMAKING_JOIN',
    requestId: `queue-${accountId}`,
    format: 'casual',
    page: 'home'
  });
}

const readySnapshot = messages.get('account-a')!.find(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'ready-check'
) as GatewayMatchSnapshotMessage;
assert.ok(readySnapshot);
matchmaker.setReady('account-a', { type: 'READY_SET', matchId: readySnapshot.matchId, ready: true });
matchmaker.setReady('account-b', { type: 'READY_SET', matchId: readySnapshot.matchId, ready: true });

let draftSnapshot = latestDraft(messages.get('account-a')!);
assert.equal(draftSnapshot.state.startingAccountId, 'account-a');
assert.equal(draftSnapshot.state.draft?.requiredPickCount, 9);
assert.equal(draftSnapshot.state.draft?.selectionDeadlineAt! - Date.now() > 14_000, true);
assert.equal(matchmaker.pickDraftChallenge('account-b', {
  type: 'DRAFT_PICK',
  matchId: draftSnapshot.matchId,
  challengeId: 'deaf-guess',
  clientRevision: draftSnapshot.revision
}).ok, false, 'The non-active player must not pick.');
assert.equal(matchmaker.pickDraftChallenge('account-a', {
  type: 'DRAFT_PICK',
  matchId: draftSnapshot.matchId,
  challengeId: 'blind-guess',
  clientRevision: draftSnapshot.revision - 1
}).ok, false, 'A stale client revision must not pick.');
assert.equal(matchmaker.pickDraftChallenge('account-a', {
  type: 'DRAFT_PICK',
  matchId: draftSnapshot.matchId,
  challengeId: 'blind-guess',
  clientRevision: draftSnapshot.revision
}).ok, true);

draftSnapshot = latestDraft(messages.get('account-a')!);
assert.equal(draftSnapshot.state.draft?.turnAccountId, 'account-b');
assert.ok(draftSnapshot.state.draft?.availableChallengeIds.includes('deaf-guess'));
assert.equal(draftSnapshot.state.draft?.availableChallengeIds.includes('drunk-vision'), false);
assert.equal(matchmaker.pickDraftChallenge('account-b', {
  type: 'DRAFT_PICK',
  matchId: draftSnapshot.matchId,
  challengeId: 'deaf-guess',
  clientRevision: draftSnapshot.revision
}).ok, true);

while (latestDraft(messages.get('account-a')!).state.draft?.status === 'selecting') {
  draftSnapshot = latestDraft(messages.get('account-a')!);
  const draft = draftSnapshot.state.draft!;
  const challengeId = draft.availableChallengeIds[0];
  assert.ok(challengeId && draft.turnAccountId);
  assert.equal(matchmaker.pickDraftChallenge(draft.turnAccountId, {
    type: 'DRAFT_PICK',
    matchId: draftSnapshot.matchId,
    challengeId,
    clientRevision: draftSnapshot.revision
  }).ok, true);
}

const completed = latestDraft(messages.get('account-a')!);
assert.equal(isGatewayServerMessage(completed), true);
assert.equal(completed.state.draft?.status, 'complete');
assert.equal(completed.state.draft?.picks.length, 9);
assert.equal(completed.state.draft?.board?.fields.length, 9);
assert.deepEqual(
  completed.state.draft?.board?.fields.map(field => field.challengeId),
  completed.state.draft?.picks.map(pick => pick.challengeId)
);
const selected = new Set(completed.state.draft?.picks.map(pick => pick.challengeId));
assert.equal(selected.size, 9);
assert.equal(selected.has('blind-guess') && selected.has('drunk-vision'), false);
assert.equal(selected.has('blind-guess') && selected.has('deaf-guess'), true);
assert.ok(messages.get('account-a')!.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'DRAFT_COMPLETED'
));
matchmaker.close();

const timeoutMessages: GatewayServerMessage[] = [];
const timeoutMatchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 1_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5,
  draftPickTimeoutMs: 8,
  simulatedDraftPickDelayMs: 5,
  matchCountdownMs: 10_000,
  createId: () => `timeout-${++id}`,
  random: () => 0.25
});
for (const accountId of ['timeout-a', 'timeout-b'] as const) {
  timeoutMatchmaker.join({
    identity: { accountId, displayName: accountId, discordUserId: accountId },
    capabilities,
    send(message) { if (accountId === 'timeout-a') timeoutMessages.push(structuredClone(message)); }
  }, {
    type: 'MATCHMAKING_JOIN',
    requestId: `queue-${accountId}`,
    format: 'casual',
    page: 'home'
  });
}
const timeoutReady = timeoutMessages.find(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'ready-check'
) as GatewayMatchSnapshotMessage;
timeoutMatchmaker.setReady('timeout-a', { type: 'READY_SET', matchId: timeoutReady.matchId, ready: true });
timeoutMatchmaker.setReady('timeout-b', { type: 'READY_SET', matchId: timeoutReady.matchId, ready: true });
await waitFor(() => latestDraft(timeoutMessages).state.draft?.status === 'complete');
const timedOutDraft = latestDraft(timeoutMessages).state.draft!;
assert.equal(timedOutDraft.picks.length, 9);
assert.equal(timedOutDraft.picks.every(pick => pick.automatic), true);
assert.ok(timeoutMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'DRAFT_PICK_TIMED_OUT'
));
timeoutMatchmaker.close();

console.log(JSON.stringify({
  authoritativeAlternatingDraft: true,
  selectionTimeoutSeconds: 15,
  staleRevisionRejected: true,
  outOfTurnRejected: true,
  conflictKeyEnforced: true,
  deafGuessCompatibilityPreserved: true,
  timeoutAutoPick: true,
  completedBoardValidated: true
}, null, 2));
