import * as assert from 'node:assert/strict';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  ouchDefinition,
  starterChallengeDefinitions
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClaimCandidateMessage,
  GatewayDraftBoardSnapshot,
  GatewayTelemetryBatchMessage,
  GatewayTelemetryEnvelope
} from '@skribbl-duels/gateway-contracts';
import { MatchStateStore, MatchTelemetryGateway, type DraftBoard } from '@skribbl-duels/product-core';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import { GatewayPlayerTelemetryAuthority } from '../apps/gateway/src/telemetryAuthority';

const startedAt = 1_800_000_000_000;
const matchId = 'integration-match';
const supportDefinitions = starterChallengeDefinitions
  .filter(definition => definition.id !== ouchDefinition.id)
  .slice(0, 8);
const fields = [ouchDefinition, ...supportDefinitions].map((definition, fieldIndex) => ({
  fieldIndex,
  challengeId: definition.id,
  definitionVersion: definition.version
}));
const board: GatewayDraftBoardSnapshot = {
  boardId: 'integration-board',
  format: 'casual',
  size: 9,
  winTarget: 5,
  seed: 49,
  createdAt: startedAt,
  fields,
  manifestVersion: 1
};

let sequence = 0;
function event(
  type: 'ROUND_STARTED' | 'FIRST_GUESS' | 'CORRECT_GUESS',
  eventId: string,
  elapsedMs: number,
  actor: TelemetryEvent['actor']
): TelemetryEvent {
  sequence += 1;
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: sequence,
    type,
    category: type === 'ROUND_STARTED' ? 'round' : 'guessing',
    occurredAt: startedAt + elapsedMs,
    monotonicMs: elapsedMs,
    actor,
    context: {
      lobbySessionId: 'integration-lobby', lobbyGeneration: 1, lobbyId: 'INTEGRATION', lobbyType: 0,
      languageId: 1, languageName: 'German', gameSessionId: 'integration-game',
      roundSessionId: 'integration-round', roundIndex: 0, roundNumber: 1, maxRounds: 3,
      gameStateId: 4, gameStateName: 'DRAWING', meId: 21, drawerId: 17
    },
    source: {
      origin: 'decoded-packet', rawRecordId: `raw-${eventId}`, changeId: null,
      direction: 'server-to-client', socketEvent: 'data', packetId: 8
    },
    payload: type === 'ROUND_STARTED'
      ? { roundIndex: 0, roundNumber: 1, maxRounds: 3, drawerId: 17 }
      : {
          playerId: actor?.playerId ?? null,
          position: type === 'FIRST_GUESS' ? 1 : 2,
          elapsedMs,
          estimatedTimeAtGuess: 80 - elapsedMs / 1_000,
          serverTimeAnchorAtGuess: 80,
          includesWord: type === 'CORRECT_GUESS',
          word: type === 'CORRECT_GUESS' ? 'Banane' : null,
          wrongGuessesBeforeCorrect: 0,
          isFirstGuesser: type === 'FIRST_GUESS'
        },
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEvent;
}

const matchStore = new MatchStateStore();
matchStore.startMatch(matchId, board as DraftBoard, [
  { playerId: 'alpha', displayName: 'Alpha', side: 'self' },
  { playerId: 'bravo', displayName: 'Bravo', side: 'opponent' }
], startedAt);
const telemetryGateway = new MatchTelemetryGateway(matchStore);
const envelopes: GatewayTelemetryEnvelope[] = [];
telemetryGateway.setTransport(envelope => {
  envelopes.push(structuredClone(envelope));
});

const localEngine = new ChallengeEngine({ autoPersist: false, createId: () => 'local-ouch-candidate' });
localEngine.register(ouchDefinition);
localEngine.activate({
  instanceId: 'duel-integration-match-field-0',
  challengeId: ouchDefinition.id,
  activatedAt: startedAt
});

const telemetry = [
  event('ROUND_STARTED', 'integration-round-start', 1_000, null),
  event('FIRST_GUESS', 'integration-first-guess', 5_000, { playerId: 31, name: 'Bravo', isSelf: false }),
  event('CORRECT_GUESS', 'integration-self-guess', 5_150, { playerId: 21, name: 'Alpha', isSelf: true })
];
for (const item of telemetry) {
  await telemetryGateway.observe(item);
  localEngine.process(item);
}
assert.equal(envelopes.length, telemetry.length);
assert.deepEqual(envelopes.map(envelope => envelope.sequence), [1, 2, 3]);
const localRuntime = localEngine.getInstance('duel-integration-match-field-0');
assert.equal(localRuntime?.status, 'completion-pending');
assert.ok(localRuntime?.completionCandidate);
matchStore.markPending(ouchDefinition.id, localRuntime.completionCandidate.candidateId, 'self', startedAt + 5_150);

const authority = new GatewayPlayerTelemetryAuthority('alpha', board, startedAt);
const batch: GatewayTelemetryBatchMessage = {
  type: 'TELEMETRY_BATCH',
  matchId,
  firstSequence: 1,
  lastSequence: envelopes.length,
  envelopes
};
assert.deepEqual(authority.processBatch(batch, startedAt + 6_000), { ok: true, lastSequence: 3 });

const candidateMessage: GatewayClaimCandidateMessage = {
  type: 'CLAIM_CANDIDATE',
  matchId,
  candidateId: localRuntime.completionCandidate.candidateId,
  challengeId: ouchDefinition.id,
  definitionVersion: ouchDefinition.version,
  evidenceEventIds: localRuntime.completionCandidate.evidenceEventIds,
  occurredAt: localRuntime.completionCandidate.completedAt,
  throughSequence: telemetryGateway.getLastSequence()
};
const validated = authority.validateClaim(candidateMessage);
assert.equal(validated.ok, true);
if (!validated.ok) throw new Error('The authoritative Ouch claim was unexpectedly rejected.');
authority.acceptClaim(validated.instanceId, 'gateway-claim-1', startedAt + 5_200);
localEngine.resolveCompletion(localRuntime.instanceId, {
  outcome: 'claimed', claimId: 'gateway-claim-1', reason: 'gateway-authoritative-claim', resolvedAt: startedAt + 5_200
});
matchStore.confirmClaim(ouchDefinition.id, 'gateway-claim-1', 'self', startedAt + 5_200);
assert.equal(matchStore.getState().fields[0]?.status, 'claimed');
assert.equal(matchStore.getState().scores.self, 1);
assert.equal(localEngine.getInstance(localRuntime.instanceId)?.status, 'claimed');

const forged = authority.validateClaim({
  ...candidateMessage,
  candidateId: 'forged-candidate',
  evidenceEventIds: ['forged-event']
});
assert.equal(forged.ok, false);
if (!forged.ok) assert.equal(forged.code, 'CLAIM_NOT_VALIDATED');

authority.destroy();
localEngine.destroy();
console.log('Local telemetry → Gateway replay → Claim validation → authoritative board integration passed.');
