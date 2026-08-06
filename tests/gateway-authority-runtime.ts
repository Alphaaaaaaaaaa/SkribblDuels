import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChallengeEngine, type CompletionCandidate } from '@skribbl-duels/challenge-engine';
import {
  registerStarterChallengeDefinitions,
  setOfficialWordListForTesting
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClaimCandidateMessage,
  GatewayDraftBoardSnapshot,
  GatewayMatchSnapshotMessage,
  GatewayServerMessage,
  GatewayTelemetryBatchMessage,
  GatewayTelemetryEnvelope
} from '@skribbl-duels/gateway-contracts';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import { GatewayMatchmaker, type MatchmakingPeer } from '../apps/gateway/src/matchmaking';

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
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for Gateway authority state.');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

function latestMatch(messages: readonly GatewayServerMessage[]): GatewayMatchSnapshotMessage {
  const snapshot = messages.filter(
    (message): message is GatewayMatchSnapshotMessage => message.type === 'MATCH_SNAPSHOT'
  ).at(-1);
  assert.ok(snapshot);
  return snapshot;
}

function peer(accountId: string, messages: GatewayServerMessage[]): MatchmakingPeer {
  return {
    identity: { accountId, displayName: accountId === 'alpha' ? 'Alpha' : 'Bravo', discordUserId: accountId },
    capabilities,
    send: message => messages.push(structuredClone(message))
  };
}

function telemetryBatch(
  matchId: string,
  events: readonly TelemetryEvent[],
  firstIndex: number,
  count: number
): GatewayTelemetryBatchMessage {
  const selected = events.slice(firstIndex, firstIndex + count);
  const envelopes: GatewayTelemetryEnvelope[] = selected.map((event, index) => ({
    contractVersion: 1,
    matchId,
    sequence: firstIndex + index + 1,
    sentAt: event.occurredAt,
    event
  }));
  return {
    type: 'TELEMETRY_BATCH',
    matchId,
    firstSequence: firstIndex + 1,
    lastSequence: firstIndex + envelopes.length,
    envelopes
  };
}

function mirrorCandidates(
  accountId: string,
  board: GatewayDraftBoardSnapshot,
  events: readonly TelemetryEvent[],
  startedAt: number
): Map<string, CompletionCandidate> {
  let clock = startedAt;
  const engine = new ChallengeEngine({ now: () => clock, autoPersist: false });
  registerStarterChallengeDefinitions(engine);
  for (const field of board.fields) {
    engine.activate({
      instanceId: `mirror-${accountId}-${field.fieldIndex}`,
      challengeId: field.challengeId,
      activatedAt: startedAt
    });
  }
  for (const event of events) {
    clock = Math.max(clock, event.occurredAt);
    engine.process(event);
  }
  const candidates = new Map<string, CompletionCandidate>();
  for (const runtime of engine.getInstances()) {
    assert.equal(runtime.status, 'completion-pending', `${runtime.challengeId} did not complete in the authority fixture.`);
    assert.ok(runtime.completionCandidate);
    candidates.set(runtime.challengeId, runtime.completionCandidate);
  }
  engine.destroy();
  return candidates;
}

setOfficialWordListForTesting(1, ['Reddit', 'Punkt', 'Ski', 'Atlantis', 'Nagel', 'Hai', 'Zoo'], 'German');
const fixture = JSON.parse(readFileSync(
  'fixtures/starter-challenges-with-typo-guess-challenges-v30.fixture.json',
  'utf8'
)) as { events: Array<{ event: TelemetryEvent }> };
const events = fixture.events.map(item => item.event);
assert.ok(events.length > 64);
let now = Math.min(...events.map(event => event.occurredAt)) - 1_000;
let id = 0;
const alphaMessages: GatewayServerMessage[] = [];
const betaMessages: GatewayServerMessage[] = [];
const resumedAlphaMessages: GatewayServerMessage[] = [];
const matchmaker = new GatewayMatchmaker({
  readyTimeoutMs: 10_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 10,
  simulatedReadyDelayMs: 10,
  draftPickTimeoutMs: 10_000,
  simulatedDraftPickDelayMs: 10,
  draftFinalRevealMs: 2,
  matchCountdownMs: 2,
  reconnectGraceMs: 1_000,
  now: () => now,
  createId: () => `authority-${++id}`,
  random: () => 0
});

matchmaker.join(peer('alpha', alphaMessages), {
  type: 'MATCHMAKING_JOIN', requestId: 'queue-alpha', format: 'casual', page: 'home'
});
matchmaker.join(peer('beta', betaMessages), {
  type: 'MATCHMAKING_JOIN', requestId: 'queue-beta', format: 'casual', page: 'home'
});
const ready = latestMatch(alphaMessages);

assert.equal(matchmaker.sendDuelChat('outsider', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'outside-1', message: 'nope'
}).ok, false);
assert.equal(matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND',
  matchId: ready.matchId,
  clientMessageId: 'chat-1',
  message: '  Hello\u0000   Bravo!  '
}).ok, true);
const alphaChat = alphaMessages.find(message => message.type === 'DUEL_CHAT_MESSAGE');
const betaChat = betaMessages.find(message => message.type === 'DUEL_CHAT_MESSAGE');
assert.ok(alphaChat?.type === 'DUEL_CHAT_MESSAGE');
assert.ok(betaChat?.type === 'DUEL_CHAT_MESSAGE');
assert.equal(alphaChat.message, 'Hello Bravo!');
assert.equal(betaChat.messageId, alphaChat.messageId);
const betaChatCount = betaMessages.filter(message => message.type === 'DUEL_CHAT_MESSAGE').length;
assert.equal(matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-1', message: 'changed replay'
}).ok, true);
assert.equal(betaMessages.filter(message => message.type === 'DUEL_CHAT_MESSAGE').length, betaChatCount);
for (let chatIndex = 2; chatIndex <= 8; chatIndex += 1) {
  assert.equal(matchmaker.sendDuelChat('alpha', {
    type: 'DUEL_CHAT_SEND',
    matchId: ready.matchId,
    clientMessageId: `chat-${chatIndex}`,
    message: `message ${chatIndex}`
  }).ok, true);
}
const rateLimited = matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-9', message: 'too fast'
});
assert.equal(rateLimited.ok, false);
if (!rateLimited.ok) assert.equal(rateLimited.code, 'CHAT_RATE_LIMITED');

matchmaker.disconnect('alpha');
assert.equal(matchmaker.resume(peer('alpha', resumedAlphaMessages), ready.matchId).status, 'resumed');
matchmaker.publishResumeSnapshot('alpha');
assert.ok(resumedAlphaMessages.some(message =>
  message.type === 'DUEL_CHAT_MESSAGE' && message.messageId === alphaChat.messageId
));

matchmaker.setReady('alpha', { type: 'READY_SET', matchId: ready.matchId, ready: true });
matchmaker.setReady('beta', { type: 'READY_SET', matchId: ready.matchId, ready: true });
while (true) {
  const snapshot = latestMatch(resumedAlphaMessages);
  if (snapshot.state.phase === 'countdown' || snapshot.state.phase === 'running') break;
  const draft = snapshot.state.draft;
  assert.ok(draft);
  if (draft.status === 'finalizing') {
    await new Promise(resolve => setTimeout(resolve, 2));
    continue;
  }
  assert.ok(draft.turnAccountId);
  assert.ok(draft.offeredChallengeIds[0]);
  assert.equal(matchmaker.pickDraftChallenge(draft.turnAccountId, {
    type: 'DRAFT_PICK',
    matchId: snapshot.matchId,
    challengeId: draft.offeredChallengeIds[0],
    clientRevision: snapshot.revision
  }).ok, true);
}
await waitFor(() => latestMatch(resumedAlphaMessages).state.phase === 'running');
const running = latestMatch(resumedAlphaMessages);
const board = running.state.draft?.board;
assert.ok(board);
assert.ok(running.state.startedAt);
now = Math.max(...events.map(event => event.occurredAt)) + 1_000;

const gap = telemetryBatch(running.matchId, events, 1, Math.min(10, events.length - 1));
assert.equal(matchmaker.processTelemetryBatch('alpha', gap).ok, false);
assert.ok(resumedAlphaMessages.some(message =>
  message.type === 'TELEMETRY_ACK' && message.lastSequence === 0
));

for (const accountId of ['alpha', 'beta'] as const) {
  for (let index = 0; index < events.length; index += 64) {
    const decision = matchmaker.processTelemetryBatch(
      accountId,
      telemetryBatch(running.matchId, events, index, Math.min(64, events.length - index))
    );
    assert.equal(decision.ok, true);
  }
}
assert.equal(matchmaker.processTelemetryBatch(
  'alpha', telemetryBatch(running.matchId, events, 0, Math.min(64, events.length))
).ok, true, 'A fully duplicated acknowledged batch should be idempotent.');

const alphaCandidates = mirrorCandidates('alpha', board, events, running.state.startedAt);
const betaCandidates = mirrorCandidates('beta', board, events, running.state.startedAt);
const firstField = board.fields[0]!;
const firstCandidate = alphaCandidates.get(firstField.challengeId)!;
const forged: GatewayClaimCandidateMessage = {
  type: 'CLAIM_CANDIDATE',
  matchId: running.matchId,
  candidateId: 'forged-candidate',
  challengeId: firstField.challengeId,
  definitionVersion: firstField.definitionVersion,
  evidenceEventIds: ['forged-event'],
  occurredAt: now,
  throughSequence: events.length
};
assert.equal(matchmaker.submitClaimCandidate('alpha', forged).ok, true);
assert.ok(resumedAlphaMessages.some(message =>
  message.type === 'CLAIM_RESOLUTION'
  && message.candidateId === forged.candidateId
  && !message.accepted
  && message.reason === 'claim_evidence_mismatch'
));

const acceptedMessages: GatewayClaimCandidateMessage[] = [];
for (const field of board.fields.slice(0, board.winTarget)) {
  const candidate = alphaCandidates.get(field.challengeId)!;
  const message: GatewayClaimCandidateMessage = {
    type: 'CLAIM_CANDIDATE',
    matchId: running.matchId,
    candidateId: `alpha-${candidate.candidateId}`,
    challengeId: field.challengeId,
    definitionVersion: field.definitionVersion,
    evidenceEventIds: candidate.evidenceEventIds,
    occurredAt: candidate.completedAt,
    throughSequence: events.length
  };
  acceptedMessages.push(message);
  assert.equal(matchmaker.submitClaimCandidate('alpha', message).ok, true);
}
const finished = latestMatch(resumedAlphaMessages);
assert.equal(finished.state.phase, 'finished');
assert.equal(finished.state.winnerAccountId, 'alpha');
assert.equal(finished.state.claims.length, board.winTarget);
assert.equal(new Set(finished.state.claims.map(claim => claim.challengeId)).size, board.winTarget);
assert.ok(resumedAlphaMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'MATCH_FINISHED'
));

const firstAccepted = acceptedMessages[0]!;
const betaCandidate = betaCandidates.get(firstAccepted.challengeId)!;
assert.equal(matchmaker.submitClaimCandidate('beta', {
  ...firstAccepted,
  candidateId: `beta-${betaCandidate.candidateId}`,
  evidenceEventIds: betaCandidate.evidenceEventIds,
  occurredAt: betaCandidate.completedAt
}).ok, true);
assert.ok(betaMessages.some(message =>
  message.type === 'CLAIM_RESOLUTION'
  && message.candidateId === `beta-${betaCandidate.candidateId}`
  && !message.accepted
  && message.reason === 'claim-match-not-running'
));
assert.equal(matchmaker.processTelemetryBatch(
  'alpha', telemetryBatch(running.matchId, events, 0, Math.min(64, events.length))
).ok, false, 'Telemetry must stop after the authoritative finish.');

matchmaker.close();
console.log(JSON.stringify({
  privateGatewayChat: true,
  chatSanitization: true,
  chatMessageIdDeduplication: true,
  chatRateLimit: true,
  reconnectChatHistory: true,
  telemetrySequenceAcks: true,
  telemetryGapRejected: true,
  duplicatedBatchIdempotent: true,
  forgedEvidenceRejected: true,
  serverChallengeReplay: true,
  authoritativeClaimsBroadcast: true,
  authoritativeWinTarget: true,
  telemetryFrozenAfterFinish: true
}, null, 2));
