import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  hintReflexesDefinition,
  noobVsProVsHackerDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const actor = { playerId: 21, name: 'Alpha', isSelf: true } as const;

function context(roundSessionId: string) {
  return {
    lobbySessionId: 'hint-position-lobby-session',
    lobbyGeneration: 1,
    lobbyId: 'HINTPOS1',
    lobbyType: 0,
    languageId: 1,
    languageName: 'German',
    gameSessionId: 'hint-position-game-session',
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId: 77
  } as const;
}

function event<T extends TelemetryEvent['type']>(
  type: T,
  eventId: string,
  monotonicMs: number,
  payload: Extract<TelemetryEvent, { type: T }>['payload'],
  roundSessionId = 'hint-turn-1',
  eventActor: TelemetryEvent['actor'] = null
): Extract<TelemetryEvent, { type: T }> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category: type === 'HINT_REVEALED' || type === 'ROUND_STARTED' ? 'round' : 'guessing',
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor: eventActor,
    context: context(roundSessionId),
    source: {
      origin: 'lobby-change',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as Extract<TelemetryEvent, { type: T }>;
}

const roundPayload = {
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId: 77,
  word: null,
  wordLengths: [8],
  initialTime: 80
};

const correct = (position: number, elapsedMs: number) => ({
  playerId: 21,
  position,
  elapsedMs,
  estimatedTimeAtGuess: 80 - elapsedMs / 1000,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Atlantis',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: position === 1
});

const hint = new ChallengeEngine({ autoPersist: false });
hint.register(hintReflexesDefinition);
hint.activate({ instanceId: 'hint', challengeId: 'hint-reflexes' });
hint.process(event('ROUND_STARTED', 'hint-round', 1000, roundPayload));
hint.process(event('HINT_REVEALED', 'hint-revealed', 2000, {
  hints: [{ position: 3, letter: 'a' }]
}));
hint.process(event('CORRECT_GUESS', 'hint-correct', 4000, correct(2, 4000), 'hint-turn-1', actor));
assert(hint.getInstance('hint')?.status === 'completion-pending', 'Exactly 2000 ms after a hint should complete Hint Reflexes.');

const late = new ChallengeEngine({ autoPersist: false });
late.register(hintReflexesDefinition);
late.activate({ instanceId: 'late', challengeId: 'hint-reflexes' });
late.process(event('ROUND_STARTED', 'late-round', 5000, roundPayload, 'late-turn'));
late.process(event('HINT_REVEALED', 'late-hint', 6000, { hints: [{ position: 1, letter: 'i' }] }, 'late-turn'));
late.process(event('CORRECT_GUESS', 'late-correct', 8001, correct(3, 5000), 'late-turn', actor));
assert(late.getInstance('late')?.progress.current === 0, 'A correct guess after more than 2000 ms must not complete Hint Reflexes.');

const positions = new ChallengeEngine({ autoPersist: false });
positions.register(noobVsProVsHackerDefinition);
positions.activate({ instanceId: 'positions', challengeId: 'noob-vs-pro-vs-hacker' });
const positionSequence = [1, 1, 2, 2, 3, 4, 4, 5, 6, 7];
positionSequence.forEach((position, index) => {
  const positionEvent = event(
    'CORRECT_GUESS',
    `position-${position}-event-${index}`,
    9000 + index,
    correct(position, 5000 + index * 1000),
    `position-turn-${index}`,
    actor
  );
  const lobbyNumber = index < 3 ? 1 : index < 7 ? 2 : 3;
  positions.process({
    ...positionEvent,
    context: {
      ...positionEvent.context,
      lobbySessionId: `hint-position-lobby-session-${lobbyNumber}`,
      lobbyGeneration: lobbyNumber,
      lobbyId: `HINTPOS${lobbyNumber}`,
      languageId: lobbyNumber,
      languageName: lobbyNumber === 1 ? 'German' : lobbyNumber === 2 ? 'English' : 'Spanish'
    }
  });
});
assert(positions.getInstance('positions')?.status === 'completion-pending', 'Collecting positions 1 through 7 must continue through duplicate positions, lobby changes and language changes.');
assert(positions.getInstance('positions')?.progress.current === 7, 'Duplicate positions must not increase progress or block later unique positions.');
assert(
  JSON.stringify((positions.getInstance('positions')?.internalState as { collectedPositions: number[] }).collectedPositions) === '[1,2,3,4,5,6,7]',
  'The challenge should retain all seven unique positions in order after interleaved duplicates.'
);

console.log('Hint Reflexes and Noob vs. Pro vs. Hacker runtime test passed.');
