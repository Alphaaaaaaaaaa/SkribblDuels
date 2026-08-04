import {
  TELEMETRY_EVENT_CATEGORIES,
  type TelemetryEvent,
  type TelemetryEventOf,
  type TelemetryEventType
} from '@skribbl-duels/telemetry-contracts';
import { readFileSync } from 'node:fs';
const quickscopeFixtureJson = JSON.parse(readFileSync(new URL('../fixtures/guessing-quickscope-synthetic-v1.fixture.json', import.meta.url), 'utf8'));
import {
  TelemetryReplayProvider,
  createTelemetryFixture,
  validateTelemetryFixture
} from '@skribbl-duels/telemetry-replay';


function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

const context = {
  lobbySessionId: 'lobby-session-1',
  lobbyGeneration: 1,
  lobbyId: 'TEST1234',
  lobbyType: 0,
  languageId: 1,
  languageName: 'German',
  gameSessionId: 'game-session-1',
  roundSessionId: 'round-session-1',
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  gameStateId: 4,
  gameStateName: 'DRAWING',
  meId: 21,
  drawerId: 17
} as const;

const source = {
  origin: 'decoded-packet',
  rawRecordId: 'raw-1',
  changeId: null,
  direction: 'server-to-client',
  socketEvent: 'data',
  packetId: 15
} as const;

function baseEvent<TType extends TelemetryEventType>(
  type: TType,
  sequence: number,
  monotonicMs: number,
  payload: TelemetryEventOf<TType>['payload']
): TelemetryEventOf<TType> {
  return {
    schemaVersion: 1,
    eventId: `event-${sequence}`,
    telemetrySequence: sequence,
    type,
    category: TELEMETRY_EVENT_CATEGORIES[type],
    occurredAt: 1_700_000_000_000 + monotonicMs,
    monotonicMs,
    actor: type === 'CORRECT_GUESS' || type === 'FIRST_GUESS'
      ? { playerId: 21, name: 'Alpha', isSelf: true }
      : null,
    context: { ...context },
    source: { ...source },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEventOf<TType>;
}

const roundStarted = baseEvent('ROUND_STARTED', 1, 1000, {
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId: 17,
  word: null,
  wordLengths: [5],
  initialTime: 80
});

const correctGuess = baseEvent('CORRECT_GUESS', 2, 5400, {
  playerId: 21,
  position: 1,
  elapsedMs: 4400,
  estimatedTimeAtGuess: 75.6,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Nagel',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
});

const fixture = createTelemetryFixture(
  [correctGuess as TelemetryEvent, roundStarted as TelemetryEvent],
  {
    fixtureId: 'quickscope-smoke',
    name: 'Quickscope smoke fixture',
    source: 'synthetic',
    tags: ['quickscope', 'smoke']
  }
);

assertEqual(fixture.events.length, 2, 'Fixture should contain two events.');
assertEqual(fixture.events[0]?.event.type, 'ROUND_STARTED', 'Fixture order should be chronological.');
assertEqual(fixture.events[0]?.offsetMs, 0, 'First event offset should be zero.');
assertEqual(fixture.events[1]?.offsetMs, 4400, 'Second event offset should preserve timing.');
assertEqual(validateTelemetryFixture(fixture).valid, true, 'Fixture should validate.');
assertEqual(
  validateTelemetryFixture(quickscopeFixtureJson).valid,
  true,
  'Committed sample fixture should validate.'
);

const replay = new TelemetryReplayProvider();
replay.load(fixture);
const received: string[] = [];
replay.subscribe(event => received.push(event.type));

const result = await replay.play({ mode: 'instant' });
assertEqual(result.status, 'completed', 'Instant replay should complete.');
assertJsonEqual(received, ['ROUND_STARTED', 'CORRECT_GUESS'], 'Replay event order mismatch.');
assertEqual(replay.getStats().total, 2, 'Replay stats should count both events.');

replay.reset();
const firstStep = replay.step();
assertEqual(firstStep[0]?.type, 'ROUND_STARTED', 'First step mismatch.');
assertEqual(replay.getState().currentIndex, 1, 'Step should advance index.');
const secondStep = replay.step();
assertEqual(secondStep[0]?.type, 'CORRECT_GUESS', 'Second step mismatch.');
assertEqual(replay.getState().status, 'completed', 'Step replay should complete.');

console.log('Replay smoke test passed.');
