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

function correctGuess(word: string, playerName = 'Alpha'): TelemetryEvent {
  return {
    schemaVersion: 1,
    eventId: `word-test-${word}`,
    telemetrySequence: 1,
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

const space = new ChallengeEngine({ autoPersist: false });
space.register(needSomeSpaceDefinition);
space.activate({ instanceId: 'space', challengeId: 'need-some-space' });
space.process(correctGuess('New-York'));
assert(space.getInstance('space')?.progress.current === 0, 'Hyphen-only term must not count.');
space.process(correctGuess('New York'));
assert(space.getInstance('space')?.status === 'completion-pending', 'Internal space should complete.');

const alliteration = new ChallengeEngine({ autoPersist: false });
alliteration.register(alliterationDefinition);
alliteration.activate({ instanceId: 'alliteration', challengeId: 'alliteration' });
alliteration.process(correctGuess('Banane'));
assert(alliteration.getInstance('alliteration')?.progress.current === 0, 'Different initials must not count.');
alliteration.process(correctGuess('Apfel', 'Älpha'));
assert(alliteration.getInstance('alliteration')?.status === 'completion-pending', 'Accent-normalized initials should match.');



setOfficialWordListForTesting(
  1,
  ['Hai', 'Ski', 'Punkt', 'Reddit', 'Atlantis', 'Donaudampfschiff'],
  'German'
);
const metrics = getOfficialWordLengthMetrics(1);
assert(metrics.shortThreshold === 3, 'Smol words should use the fifth-percentile threshold.');
assert(metrics.longThreshold === 8, 'Big word should use the ninetieth-percentile threshold.');

const smol = new ChallengeEngine({ autoPersist: false });
smol.register(smolWordsDefinition);
smol.activate({ instanceId: 'smol', challengeId: 'smol-words' });
smol.process(correctGuess('Punkt'));
assert(smol.getInstance('smol')?.progress.current === 0, 'A word above the fifth-percentile threshold must not count.');
smol.process(correctGuess('Hai'));
assert(smol.getInstance('smol')?.status === 'completion-pending', 'An official fifth-percentile word should complete Smol words.');

const big = new ChallengeEngine({ autoPersist: false });
big.register(bigWordDefinition);
big.activate({ instanceId: 'big', challengeId: 'big-word' });
big.process(correctGuess('Reddit'));
assert(big.getInstance('big')?.progress.current === 0, 'A word below the long threshold must not count.');
big.process(correctGuess('Atlantis'));
assert(big.getInstance('big')?.status === 'completion-pending', 'An official ninetieth-percentile word should complete Big word.');

console.log('Word challenge runtime test passed.');
