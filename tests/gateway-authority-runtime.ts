import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  setOfficialWordListForTesting
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClaimCandidateMessage,
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
now += 50;
assert.equal(matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-2', message: 'message 2'
}).ok, true);
now += 50;
assert.equal(matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-3', message: 'message 3'
}).ok, true);
now += 50;
const rateLimited = matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-4', message: 'too fast'
});
assert.equal(rateLimited.ok, false);
if (!rateLimited.ok) {
  assert.equal(rateLimited.code, 'CHAT_SPAM_DETECTED');
  assert.equal(rateLimited.message, 'Spam detected! You\'re sending messages too quickly.');
}
now += 900;
assert.equal(matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-5', message: 'after cooldown'
}).ok, true);
now += 2_000;
assert.equal(matchmaker.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND', matchId: ready.matchId, clientMessageId: 'chat-6', message: 'after score reduction'
}).ok, true);

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

const firstField = board.fields[0]!;
const forged: GatewayClaimCandidateMessage = {
  type: 'CLAIM_CANDIDATE',
  matchId: running.matchId,
  candidateId: 'forged-candidate',
  challengeId: firstField.challengeId,
  definitionVersion: firstField.definitionVersion,
  evidenceEventIds: ['forged-event'],
  occurredAt: running.state.startedAt,
  throughSequence: 0
};
assert.equal(matchmaker.submitClaimCandidate('alpha', forged).ok, true);
assert.ok(resumedAlphaMessages.some(message =>
  message.type === 'CLAIM_RESOLUTION'
  && message.candidateId === forged.candidateId
  && !message.accepted
  && message.reason === 'claim_not_validated'
));

let acceptedThroughSequence = 0;
for (let index = 0; index < events.length; index += 64) {
  const decision = matchmaker.processTelemetryBatch(
    'alpha',
    telemetryBatch(running.matchId, events, index, Math.min(64, events.length - index))
  );
  assert.equal(decision.ok, true, JSON.stringify({ index, decision }));
  acceptedThroughSequence = Math.min(index + 64, events.length);
  if (latestMatch(resumedAlphaMessages).state.phase === 'finished') break;
}
const finished = latestMatch(resumedAlphaMessages);
assert.equal(finished.state.phase, 'finished');
assert.equal(finished.state.conclusion?.outcome, 'win');
assert.equal(finished.state.conclusion?.reason, 'win-target-reached');
assert.equal(finished.state.conclusion?.winnerAccountId, 'alpha');
assert.equal(finished.state.claims.length, board.winTarget);
assert.equal(new Set(finished.state.claims.map(claim => claim.challengeId)).size, board.winTarget);
assert.ok(resumedAlphaMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'MATCH_FINISHED'
));
const automaticResolutions = resumedAlphaMessages.filter(message =>
  message.type === 'CLAIM_RESOLUTION'
  && message.ownerAccountId === 'alpha'
  && message.accepted
  && message.reason === 'server-telemetry-certified'
);
assert.equal(automaticResolutions.length, board.winTarget);
assert.ok(acceptedThroughSequence > 0);

assert.equal(matchmaker.submitClaimCandidate('beta', {
  ...forged,
  candidateId: 'beta-after-finish'
}).ok, true);
assert.ok(betaMessages.some(message =>
  message.type === 'CLAIM_RESOLUTION'
  && message.candidateId === 'beta-after-finish'
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
  skribblStyleChatSpam: true,
  reconnectChatHistory: true,
  telemetrySequenceAcks: true,
  telemetryGapRejected: true,
  automaticClaimsFromAcceptedTelemetry: true,
  forgedEvidenceRejected: true,
  serverChallengeReplay: true,
  authoritativeClaimsBroadcast: true,
  authoritativeWinTarget: true,
  telemetryFrozenAfterFinish: true
}, null, 2));
