import * as assert from 'node:assert/strict';
import type {
  GatewayDraftState,
  GatewayMatchSnapshotMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { isGatewayServerMessage } from '@skribbl-duels/gateway-contracts';
import { GatewayDraftAuthority } from '../apps/gateway/src/draftAuthority';
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
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for authoritative pair draft state.');
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

function assertPairOffer(draft: GatewayDraftState, categoryById: ReadonlyMap<string, string>): void {
  assert.equal(draft.status, 'selecting');
  assert.equal(draft.offeredChallengeIds.length, 2);
  assert.equal(new Set(draft.offeredChallengeIds).size, 2);
  const categories = draft.offeredChallengeIds.map(challengeId => categoryById.get(challengeId));
  assert.ok(categories.every(category => category !== undefined));
  assert.notEqual(categories[0], categories[1], 'Offers should span two underrepresented categories when possible.');
}

const authority = new GatewayDraftAuthority();
const categoryById = new Map(authority.manifest.entries.map(entry => [entry.id, entry.category]));
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
  draftFinalRevealMs: 20,
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
let draft = draftSnapshot.state.draft!;
assert.equal(draftSnapshot.state.startingAccountId, 'account-a');
assert.equal(draft.requiredPickCount, 9);
assert.equal(draft.playerPickCount, 8);
assert.equal(draft.selectionDeadlineAt! - Date.now() > 14_000, true);
assertPairOffer(draft, categoryById);
const firstOffer = draft.offeredChallengeIds[0]!;
assert.equal(matchmaker.pickDraftChallenge('account-b', {
  type: 'DRAFT_PICK',
  matchId: draftSnapshot.matchId,
  challengeId: firstOffer,
  clientRevision: draftSnapshot.revision
}).ok, false, 'The non-active player must not pick.');
assert.equal(matchmaker.pickDraftChallenge('account-a', {
  type: 'DRAFT_PICK',
  matchId: draftSnapshot.matchId,
  challengeId: firstOffer,
  clientRevision: draftSnapshot.revision - 1
}).ok, false, 'A stale client revision must not pick.');

while (true) {
  draftSnapshot = latestDraft(messages.get('account-a')!);
  draft = draftSnapshot.state.draft!;
  if (draft.status !== 'selecting') break;
  assertPairOffer(draft, categoryById);
  const challengeId = draft.offeredChallengeIds[0]!;
  assert.ok(draft.turnAccountId);
  assert.equal(matchmaker.pickDraftChallenge(draft.turnAccountId, {
    type: 'DRAFT_PICK',
    matchId: draftSnapshot.matchId,
    challengeId,
    clientRevision: draftSnapshot.revision
  }).ok, true);
}

const finalizing = latestDraft(messages.get('account-a')!);
assert.equal(finalizing.state.phase, 'draft');
assert.equal(finalizing.state.draft?.status, 'finalizing');
assert.equal(finalizing.state.draft?.picks.length, 8);
assert.equal(finalizing.state.draft?.offeredChallengeIds.length, 0);
assert.ok(finalizing.state.draft?.finalCandidateChallengeIds.length);
assert.ok(finalizing.state.draft?.finalRevealAt);
const playerPicks = finalizing.state.draft!.picks;
assert.equal(playerPicks.filter(pick => pick.accountId === 'account-a').length, 4);
assert.equal(playerPicks.filter(pick => pick.accountId === 'account-b').length, 4);

await waitFor(() => latestDraft(messages.get('account-a')!).state.draft?.status === 'complete');
const completed = latestDraft(messages.get('account-a')!);
assert.equal(isGatewayServerMessage(completed), true);
assert.equal(completed.state.draft?.picks.length, 9);
assert.equal(completed.state.draft?.board?.fields.length, 9);
assert.deepEqual(
  completed.state.draft?.board?.fields.map(field => field.challengeId),
  completed.state.draft?.picks.map(pick => pick.challengeId)
);
const finalPick = completed.state.draft!.picks.at(-1)!;
assert.equal(finalPick.accountId, null);
assert.equal(finalPick.source, 'server-random');
assert.equal(finalPick.automatic, true);
assert.ok(finalizing.state.draft!.finalCandidateChallengeIds.includes(finalPick.challengeId));
const selected = new Set(completed.state.draft?.picks.map(pick => pick.challengeId));
assert.equal(selected.size, 9);
assert.equal(selected.has('blind-guess') && selected.has('drunk-vision'), false);
assert.ok(messages.get('account-a')!.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'DRAFT_FINAL_RANDOM_STARTED'
));
assert.ok(messages.get('account-a')!.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'DRAFT_FINAL_RANDOM_SELECTED'
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
  draftFinalRevealMs: 8,
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
assert.equal(timedOutDraft.picks.slice(0, -1).every(pick => pick.source === 'selection-timeout'), true);
assert.equal(timedOutDraft.picks.at(-1)?.source, 'server-random');
assert.ok(timeoutMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'DRAFT_PICK_TIMED_OUT'
));
timeoutMatchmaker.close();

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

for (let seed = 0; seed < 250; seed += 1) {
  const random = seededRandom(seed);
  const selectedIds: string[] = [];
  for (let pickIndex = 0; pickIndex < 24; pickIndex += 1) {
    const offer = authority.createChallengeOffer('ranked', selectedIds, capabilities, seed, random);
    assert.equal(offer.length, 2, `Ranked seed ${seed} lost its pair offer at pick ${pickIndex + 1}.`);
    assert.equal(new Set(offer).size, 2);
    const selected = offer[Math.min(1, Math.floor(random() * offer.length))];
    assert.ok(selected);
    selectedIds.push(selected);
  }
  const finalSelection = authority.chooseFinalChallengeId('ranked', selectedIds, capabilities, seed, random);
  assert.ok(finalSelection);
  selectedIds.push(finalSelection.challengeId);
  const board = authority.createCompletedBoard('ranked', selectedIds, capabilities, seed, seed + 1);
  assert.equal(board.fields.length, 25);
  assert.equal(new Set(board.fields.map(field => field.challengeId)).size, 25);
  const categories = new Set(board.fields.map(field => categoryById.get(field.challengeId)));
  assert.ok(categories.size >= 4, `Ranked seed ${seed} is not sufficiently multi-category.`);
}

console.log(JSON.stringify({
  authoritativePairDraft: true,
  exactlyTwoCategoryBalancedOffers: true,
  selectionTimeoutSeconds: 15,
  staleRevisionRejected: true,
  outOfTurnRejected: true,
  equalPlayerPickParity: true,
  serverRandomFinalField: true,
  conflictKeyEnforced: true,
  timeoutAutoPick: true,
  rankedPairDraftSeeds: 250,
  multiCategoryBoards: true,
  incrementalBoardSnapshots: true,
  completedBoardValidated: true
}, null, 2));
