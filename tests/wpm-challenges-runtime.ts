import * as assert from 'node:assert/strict';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  internetExplorerDefinition,
  starterChallengeDefinitions,
  typeRacerDefinition,
  wpMasterDefinition,
  type CertifiedWpmState
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayDraftBoardSnapshot,
  GatewayTelemetryBatchMessage
} from '@skribbl-duels/gateway-contracts';
import type {
  TelemetryEvent,
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';
import { GatewayPlayerTelemetryAuthority } from '../apps/gateway/src/telemetryAuthority';

const BASE_TIME = 1_900_000_000_000;
let sequence = 0;
let clock = BASE_TIME + 10_000;

interface AttemptOptions {
  id: string;
  message: string;
  durationMs: number;
  lobbySessionId?: string;
  roundSessionId?: string;
  position?: number;
  pasteDetected?: boolean;
  autofillDetected?: boolean;
  trustedInput?: boolean;
  eligibleGuess?: boolean;
  inputSource?: 'vanilla' | 'typo';
  revealedWord?: string | null;
}

function context(lobbySessionId: string, roundSessionId: string) {
  return {
    lobbySessionId,
    lobbyGeneration: 1,
    lobbyId: lobbySessionId.toUpperCase(),
    lobbyType: 0,
    languageId: 0,
    languageName: 'English',
    gameSessionId: `${lobbySessionId}-game`,
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId: 31
  } as const;
}

function nextBase<T extends TelemetryEvent['type']>(
  type: T,
  eventId: string,
  occurredAt: number,
  lobbySessionId: string,
  roundSessionId: string
) {
  sequence += 1;
  return {
    schemaVersion: 1 as const,
    eventId,
    telemetrySequence: sequence,
    type,
    occurredAt,
    monotonicMs: occurredAt - BASE_TIME,
    actor: { playerId: 21, name: 'Alpha', isSelf: true },
    context: context(lobbySessionId, roundSessionId),
    highVolume: false as const
  };
}

function attemptEvents(options: AttemptOptions): [
  TelemetryEventOf<'TEXT_INPUT_MEASURED'>,
  TelemetryEventOf<'GUESS_SUBMITTED'>,
  TelemetryEventOf<'CORRECT_GUESS'>
] {
  clock += 10_000;
  const lobbySessionId = options.lobbySessionId ?? 'wpm-lobby-a';
  const roundSessionId = options.roundSessionId ?? `round-${options.id}`;
  const measurementAt = clock;
  const submitAt = measurementAt + 50;
  const correctAt = measurementAt + 150;
  const position = options.position ?? 1;
  const characterCount = Array.from(options.message.trim().normalize('NFKC')).length;

  const measurement: TelemetryEventOf<'TEXT_INPUT_MEASURED'> = {
    ...nextBase('TEXT_INPUT_MEASURED', `${options.id}-measurement`, measurementAt, lobbySessionId, roundSessionId),
    category: 'chat',
    source: {
      origin: 'dom-adapter',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload: {
      attemptId: `${options.id}-attempt`,
      message: options.message,
      eligibleGuess: options.eligibleGuess ?? true,
      inputSource: options.inputSource ?? 'vanilla',
      startedAt: measurementAt - options.durationMs,
      submittedAt: measurementAt,
      durationMs: options.durationMs,
      characterCount,
      correctionCount: 0,
      pasteDetected: options.pasteDetected ?? false,
      autofillDetected: options.autofillDetected ?? false,
      compositionUsed: false,
      trustedInput: options.trustedInput ?? true
    },
    confidence: options.trustedInput === false ? 'provisional' : 'confirmed'
  };

  const submission: TelemetryEventOf<'GUESS_SUBMITTED'> = {
    ...nextBase('GUESS_SUBMITTED', `${options.id}-submission`, submitAt, lobbySessionId, roundSessionId),
    category: 'guessing',
    source: {
      origin: 'decoded-packet',
      rawRecordId: `${options.id}-outgoing-record`,
      changeId: null,
      direction: 'client-to-server',
      socketEvent: 'data',
      packetId: 30
    },
    payload: {
      message: options.message,
      submittedAtServerTime: 70
    },
    confidence: 'derived'
  };

  const correct: TelemetryEventOf<'CORRECT_GUESS'> = {
    ...nextBase('CORRECT_GUESS', `${options.id}-correct`, correctAt, lobbySessionId, roundSessionId),
    category: 'guessing',
    source: {
      origin: 'lobby-change',
      rawRecordId: `${options.id}-incoming-record`,
      changeId: `${options.id}-correct-change`,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload: {
      playerId: 21,
      position,
      elapsedMs: 5_000,
      estimatedTimeAtGuess: 75,
      serverTimeAnchorAtGuess: 80,
      includesWord: options.revealedWord !== null,
      word: options.revealedWord === undefined ? options.message : options.revealedWord,
      wrongGuessesBeforeCorrect: 0,
      isFirstGuesser: position === 1
    },
    confidence: 'confirmed'
  };

  return [measurement, submission, correct];
}

function engineFor(
  definition: typeof internetExplorerDefinition | typeof wpMasterDefinition | typeof typeRacerDefinition,
  instanceId: string
): ChallengeEngine {
  const engine = new ChallengeEngine({ autoPersist: false, createId: () => `${instanceId}-candidate` });
  engine.register(definition);
  engine.activate({ instanceId, challengeId: definition.id });
  return engine;
}

function processAttempt(engine: ChallengeEngine, options: AttemptOptions): ReturnType<typeof attemptEvents> {
  const events = attemptEvents(options);
  engine.processMany(events);
  return events;
}

assert.equal(starterChallengeDefinitions.length, 53, 'The growing pool must contain Challenges 51–53.');
for (const definition of [internetExplorerDefinition, wpMasterDefinition, typeRacerDefinition]) {
  assert.equal(definition.metadata.rankedEligible, false, `${definition.id} remains Casual-only until live certification.`);
  assert.deepEqual(definition.relevantEvents, ['TEXT_INPUT_MEASURED', 'GUESS_SUBMITTED', 'CORRECT_GUESS']);
  assert.equal(definition.resetOn, undefined, `${definition.id} progress must not reset just because the lobby changes.`);
}

const explorer = engineFor(internetExplorerDefinition, 'internet-explorer');
processAttempt(explorer, { id: 'ie-exact-boundary', message: 'sloth', durationMs: 3_000, position: 2 });
assert.equal(explorer.getInstance('internet-explorer')?.progress.current, 0, 'Exactly 20 WPM is not below 20 WPM.');
processAttempt(explorer, { id: 'ie-paste', message: 'sloth', durationMs: 3_100, position: 2, pasteDetected: true });
processAttempt(explorer, { id: 'ie-autofill', message: 'sloth', durationMs: 3_100, position: 2, autofillDetected: true });
processAttempt(explorer, { id: 'ie-untrusted', message: 'sloth', durationMs: 3_100, position: 2, trustedInput: false });
assert.equal(explorer.getInstance('internet-explorer')?.progress.current, 0, 'Paste, autofill and untrusted input must fail closed.');

const staleExplorer = engineFor(internetExplorerDefinition, 'internet-explorer-stale');
const cleanEarlier = attemptEvents({
  id: 'ie-clean-earlier', message: 'sloth', durationMs: 3_100, position: 2, roundSessionId: 'ie-stale-round'
});
const pastedLater = attemptEvents({
  id: 'ie-pasted-later', message: 'sloth', durationMs: 3_100, position: 2, roundSessionId: 'ie-stale-round', pasteDetected: true
});
staleExplorer.process(cleanEarlier[0]);
staleExplorer.processMany(pastedLater);
assert.equal(
  staleExplorer.getInstance('internet-explorer-stale')?.progress.current,
  0,
  'A later pasted submission cannot inherit an older clean timing sample for the same text.'
);

const explorerSuccess = processAttempt(explorer, {
  id: 'ie-success', message: 'sloth', durationMs: 3_100, position: 2
});
const explorerRuntime = explorer.getInstance('internet-explorer');
assert.equal(explorerRuntime?.status, 'completion-pending', 'A non-first correct guess below 20 WPM must complete Internet Explorer.');
assert.deepEqual(
  explorerRuntime?.completionCandidate?.evidenceEventIds,
  explorerSuccess.map(event => event.eventId),
  'Internet Explorer requires the measurement, outgoing submit and server-confirmed correct guess.'
);

const master = engineFor(wpMasterDefinition, 'wpmaster');
const fiveCharacterWords = ['alpha', 'bravo', 'cider', 'delta', 'eagle', 'fable', 'grape', 'hotel', 'ivory'];
for (const [index, message] of fiveCharacterWords.entries()) {
  processAttempt(master, {
    id: `master-${index + 1}`,
    message,
    durationMs: 400,
    lobbySessionId: index < 4 ? 'master-lobby-a' : 'master-lobby-b',
    position: 1
  });
}
assert.equal(master.getInstance('wpmaster')?.progress.current, 9, 'Nine exact-boundary 150 WPM First Guesses produce 9/10.');
processAttempt(master, {
  id: 'master-non-first', message: 'joker', durationMs: 300, lobbySessionId: 'master-lobby-c', position: 2
});
processAttempt(master, {
  id: 'master-pasted', message: 'kiosk', durationMs: 300, lobbySessionId: 'master-lobby-c', position: 1, pasteDetected: true
});
assert.equal(master.getInstance('wpmaster')?.progress.current, 9, 'A fast non-first or pasted guess neither counts nor resets valid progress.');
const masterTenth = processAttempt(master, {
  id: 'master-10', message: 'lemon', durationMs: 400, lobbySessionId: 'master-lobby-d', position: 1, inputSource: 'typo'
});
const masterRuntime = master.getInstance('wpmaster');
assert.equal(masterRuntime?.status, 'completion-pending');
assert.equal(masterRuntime?.progress.current, 10);
assert.equal(masterRuntime?.completionCandidate?.evidenceEventIds.length, 30, 'Ten certified guesses require three evidence events each.');
assert.deepEqual(masterRuntime?.completionCandidate?.evidenceEventIds.slice(-3), masterTenth.map(event => event.eventId));
assert.equal(
  new Set((masterRuntime?.internalState as CertifiedWpmState).qualifyingAttemptIds).size,
  10,
  'Every WPMaster increment must use a distinct measured attempt.'
);

const racer = engineFor(typeRacerDefinition, 'type-racer');
processAttempt(racer, { id: 'racer-too-slow', message: 'rocket', durationMs: 289, position: 1 });
processAttempt(racer, { id: 'racer-non-first', message: 'rocket', durationMs: 250, position: 2 });
processAttempt(racer, { id: 'racer-pasted', message: 'rocket', durationMs: 250, position: 1, pasteDetected: true });
assert.equal(racer.getInstance('type-racer')?.progress.current, 0, '249.13 WPM, non-first and pasted guesses cannot complete TypeRacer.');
const racerSuccess = processAttempt(racer, { id: 'racer-success', message: 'rocket', durationMs: 288, position: 1 });
assert.equal(racer.getInstance('type-racer')?.status, 'completion-pending', 'Exactly 250 WPM as First Guesser qualifies.');
assert.deepEqual(racer.getInstance('type-racer')?.completionCandidate?.evidenceEventIds, racerSuccess.map(event => event.eventId));

const gatewayFields = [
  typeRacerDefinition,
  ...starterChallengeDefinitions.filter(definition => definition.id !== typeRacerDefinition.id).slice(0, 8)
].map((definition, fieldIndex) => ({
  fieldIndex,
  challengeId: definition.id,
  definitionVersion: definition.version
}));
const gatewayBoard: GatewayDraftBoardSnapshot = {
  boardId: 'wpm-gateway-board',
  format: 'casual',
  size: 9,
  winTarget: 5,
  seed: 60,
  createdAt: BASE_TIME,
  fields: gatewayFields,
  manifestVersion: 1
};
const gatewayEvents = attemptEvents({
  id: 'gateway-racer', message: 'rocket', durationMs: 288, position: 1, lobbySessionId: 'gateway-wpm-lobby'
});
const gatewayBatch: GatewayTelemetryBatchMessage = {
  type: 'TELEMETRY_BATCH',
  matchId: 'wpm-gateway-match',
  firstSequence: 1,
  lastSequence: 3,
  envelopes: gatewayEvents.map((event, index) => ({
    contractVersion: 1,
    matchId: 'wpm-gateway-match',
    sequence: index + 1,
    sentAt: event.occurredAt,
    event
  }))
};
const authority = new GatewayPlayerTelemetryAuthority('alpha', gatewayBoard, BASE_TIME);
assert.deepEqual(
  authority.processBatch(gatewayBatch, gatewayEvents.at(-1)!.occurredAt + 1_000),
  { ok: true, lastSequence: 3 }
);
const gatewayCompletion = authority.pendingCompletions().find(item => item.challengeId === 'type-racer');
assert.ok(gatewayCompletion, 'The Gateway must independently replay and certify the TypeRacer completion.');
assert.deepEqual(gatewayCompletion.candidate.evidenceEventIds, gatewayEvents.map(event => event.eventId));
authority.destroy();

console.log('Internet Explorer, WPMaster and TypeRacer certified WPM evidence tests passed.');
