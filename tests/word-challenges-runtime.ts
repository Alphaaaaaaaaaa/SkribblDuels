import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  alliterationDefinition,
  bigWordDefinition,
  getOfficialWordLengthMetrics,
  needSomeSpaceDefinition,
  setOfficialWordListForTesting,
  smolWordsDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let eventSequence = 0;
function correctGuess(word: string, playerName = 'Alpha'): TelemetryEvent {
  eventSequence += 1;
  return {
    schemaVersion: 1,
    eventId: `word-test-${eventSequence}-${word}`,
    telemetrySequence: eventSequence,
    type: 'CORRECT_GUESS',
    category: 'guessing',
    occurredAt: 1,
    monotonicMs: 1,
    actor: { playerId: 1, name: playerName, isSelf: true },
    context: {
      lobbySessionId: 'lobby', lobbyGeneration: 1, lobbyId: 'PUBLIC', lobbyType: 0,
      languageId: 1, languageName: 'German', gameSessionId: 'game', roundSessionId: 'turn',
      roundIndex: 0, roundNumber: 1, maxRounds: 3, gameStateId: 4,
      gameStateName: 'DRAWING', meId: 1, drawerId: 2
    },
    source: {
      origin: 'decoded-packet', rawRecordId: null, changeId: null,
      direction: 'server-to-client', socketEvent: 'data', packetId: 15
    },
    payload: {
      playerId: 1, position: 1, elapsedMs: 1000, estimatedTimeAtGuess: 79,
      serverTimeAnchorAtGuess: 80, includesWord: true, word,
      wrongGuessesBeforeCorrect: 0, isFirstGuesser: true
    },
    confidence: 'confirmed',
    highVolume: false
  };
}

setOfficialWordListForTesting(
  1,
  [
    'Hai', 'Ski', 'Ufo', 'Punkt', 'Reddit', 'Atlantis', 'Donaudampfschiff',
    'New York', 'San Francisco Bay', 'Los Angeles County', 'New York City'
  ],
  'German'
);

const space = new ChallengeEngine({ autoPersist: false });
space.register(needSomeSpaceDefinition);
space.activate({ instanceId: 'space', challengeId: 'need-some-space' });
space.process(correctGuess('New-York'));
assert(space.getInstance('space')?.progress.current === 0, 'Hyphen-only term must not count.');
space.process(correctGuess('New York'));
assert(space.getInstance('space')?.status === 'active', 'A two-part entry below the language-specific threshold must not count.');
space.process(correctGuess('San Francisco Bay'));
assert(space.getInstance('space')?.status === 'completion-pending', 'A language-qualified multi-word entry should complete.');

const alliteration = new ChallengeEngine({ autoPersist: false });
alliteration.register(alliterationDefinition);
alliteration.activate({ instanceId: 'alliteration', challengeId: 'alliteration' });
alliteration.process(correctGuess('Banane'));
assert(alliteration.getInstance('alliteration')?.progress.current === 0, 'Different initials must not count.');
alliteration.process(correctGuess('Apfel', 'Älpha'));
assert(alliteration.getInstance('alliteration')?.status === 'completion-pending', 'Accent-normalized initials should match.');

const metrics = getOfficialWordLengthMetrics(1);
assert(metrics.shortThreshold === 3, 'Smol words should use the fifth-percentile threshold.');
assert(metrics.shortRequiredCount === 3, 'Short-word ties should derive a three-word language target.');
assert(metrics.longRequiredCount === 2, 'Long-word ties should derive a two-word language target.');
assert(metrics.spacedWordThreshold === 3, 'Need some space should derive a three-component language threshold.');

const smol = new ChallengeEngine({ autoPersist: false });
smol.register(smolWordsDefinition);
smol.activate({ instanceId: 'smol', challengeId: 'smol-words' });
smol.process(correctGuess('Punkt'));
assert(smol.getInstance('smol')?.progress.current === 0, 'A word above the fifth-percentile threshold must not count.');
smol.process(correctGuess('Hai'));
smol.process(correctGuess('Ski'));
assert(smol.getInstance('smol')?.status === 'active', 'Smol words should wait for the language-specific count.');
smol.process(correctGuess('Ufo'));
assert(smol.getInstance('smol')?.status === 'completion-pending', 'The language-specific short-word count should complete Smol words.');

const big = new ChallengeEngine({ autoPersist: false });
big.register(bigWordDefinition);
big.activate({ instanceId: 'big', challengeId: 'big-word' });
big.process(correctGuess('Reddit'));
assert(big.getInstance('big')?.progress.current === 0, 'A word below the long threshold must not count.');
big.process(correctGuess('Donaudampfschiff'));
assert(big.getInstance('big')?.status === 'active', 'Big word should wait for the language-specific count.');
big.process(correctGuess('Los Angeles County'));
assert(big.getInstance('big')?.status === 'completion-pending', 'The language-specific long-word count should complete Big word.');

console.log('Word challenge runtime test passed.');
