import { readFileSync } from 'node:fs';
const fixtureJson = JSON.parse(readFileSync(new URL('../fixtures/guessing-quickscope-synthetic-v1.fixture.json', import.meta.url), 'utf8'));
import {
  ChallengeEngine,
  MemoryChallengePersistence,
  type ChallengeDefinition
} from '@skribbl-duels/challenge-engine';
import {
  TelemetryReplayProvider,
  validateTelemetryFixture
} from '@skribbl-duels/telemetry-replay';
import type { TelemetryEventOf } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

interface QuickscopeState {
  qualifyingGuesses: number;
}

interface QuickscopeParameters {
  seconds: number;
  amount: number;
}

const quickscopeDefinition: ChallengeDefinition<QuickscopeState, QuickscopeParameters> = {
  id: 'quickscope-test',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: {
      en: {
        name: 'Quickscope test',
        description: 'Guess quickly.'
      }
    },
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    seconds: 5,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({ qualifyingGuesses: 0 }),
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;
    if (event.payload.elapsedMs === null || event.payload.elapsedMs > parameters.seconds * 1000) {
      return null;
    }
    const next = runtime.internalState.qualifyingGuesses + 1;
    return {
      internalState: { qualifyingGuesses: next },
      progress: next,
      complete: next >= parameters.amount,
      reason: 'qualifying-fast-guess',
      evidenceEventIds: [event.eventId]
    };
  }
};

const validation = validateTelemetryFixture(fixtureJson);
assert(validation.valid && validation.fixture, 'Quickscope fixture must be valid.');
const fixture = validation.fixture;

let now = 1_800_000_000_000;
let idCounter = 0;
const persistence = new MemoryChallengePersistence();
const engine = new ChallengeEngine({
  persistence,
  autoPersist: false,
  now: () => now,
  createId: () => `engine-id-${++idCounter}`
});
engine.register(quickscopeDefinition);
engine.activate({
  instanceId: 'field-1',
  challengeId: quickscopeDefinition.id
});

const replay = new TelemetryReplayProvider();
replay.load(fixture);
const detach = engine.attachProvider(replay, 'fixture');
await replay.play({ mode: 'instant' });

detach();
const pending = engine.getInstance('field-1');
assert(pending, 'Quickscope instance must exist.');
assertEqual(pending.status, 'completion-pending', 'Quickscope should create a completion candidate.');
assertEqual(pending.progress.current, 1, 'Quickscope progress should reach one.');
assertEqual(
  pending.completionCandidate?.triggerEventId,
  'quickscope-correct-guess',
  'Completion evidence should reference the correct guess.'
);
assertEqual(engine.getStats().completionCandidates, 1, 'One candidate should be counted.');

// Duplicate telemetry IDs must not progress again.
const guess = fixture.events[1]?.event as TelemetryEventOf<'CORRECT_GUESS'> | undefined;
assert(guess, 'Fixture must contain a correct guess.');
engine.process(guess);
assertEqual(engine.getStats().duplicateTelemetryEvents, 1, 'Duplicate event should be counted.');
assertEqual(engine.getInstance('field-1')?.progress.current, 1, 'Duplicate event must not progress.');

const claimed = engine.resolveCompletion('field-1', {
  outcome: 'claimed',
  claimId: 'server-claim-1'
});
assertEqual(claimed.status, 'claimed', 'Claim resolution should mark the challenge claimed.');
assertEqual(claimed.claimId, 'server-claim-1', 'Claim ID should be retained.');

// Lifecycle resets apply only to active runtimes; a claimed field must survive lobby changes.
const claimedLobbyChange = structuredClone(guess);
claimedLobbyChange.eventId = 'claimed-lobby-change-event';
claimedLobbyChange.context.lobbySessionId = 'claimed-other-lobby-session';
claimedLobbyChange.context.lobbyId = 'CLAIMED-OTHER';
engine.process(claimedLobbyChange);
assertEqual(
  engine.getInstance('field-1')?.status,
  'claimed',
  'A lobby change must not reset or reopen a claimed challenge.'
);
assertEqual(
  engine.getInstance('field-1')?.claimId,
  'server-claim-1',
  'A lobby change must preserve the server claim ID.'
);

// Persistence round-trip with a registered definition.
await persistence.save(engine.exportSnapshot());
const restoredEngine = new ChallengeEngine({ persistence, autoPersist: false });
restoredEngine.register(quickscopeDefinition);
await restoredEngine.restore();
assertEqual(
  restoredEngine.getInstance('field-1')?.status,
  'claimed',
  'Claimed state should survive persistence.'
);

// Lifecycle reset test on an active, two-step instance.
const streakDefinition: ChallengeDefinition<{ count: number }, { amount: number }> = {
  ...quickscopeDefinition,
  id: 'lobby-reset-test',
  defaultParameters: { amount: 2 },
  target: parameters => parameters.amount,
  createInitialState: () => ({ count: 0 }),
  reduce({ event, runtime }) {
    if (event.type !== 'CORRECT_GUESS' || !event.actor?.isSelf) return null;
    const count = runtime.internalState.count + 1;
    return { internalState: { count }, progress: count };
  }
};
const resetEngine = new ChallengeEngine({ now: () => ++now });
resetEngine.register(streakDefinition);
resetEngine.activate({ instanceId: 'field-reset', challengeId: streakDefinition.id });
const firstGuess = structuredClone(guess);
firstGuess.eventId = 'first-reset-guess';
resetEngine.process(firstGuess);
assertEqual(resetEngine.getInstance('field-reset')?.progress.current, 1, 'First streak event should count.');

const changedLobbyGuess = structuredClone(guess);
changedLobbyGuess.eventId = 'second-reset-guess';
changedLobbyGuess.context.lobbySessionId = 'other-lobby-session';
changedLobbyGuess.context.lobbyId = 'OTHER';
resetEngine.process(changedLobbyGuess);
assertEqual(
  resetEngine.getInstance('field-reset')?.progress.current,
  1,
  'Lobby change should reset, then current event should start the streak again.'
);
assertEqual(resetEngine.getStats().completionPending, 0, 'Reset streak should not be complete.');

console.log('Challenge engine smoke test passed.');
