import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  evaluateTldrMessage,
  getProseDictionarySummary,
  isRecognizedProseWord,
  tldrDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parameters = tldrDefinition.defaultParameters;

assert(
  getProseDictionarySummary().length === 28,
  'TL;DR must ship an offline prose dictionary for all 28 Skribbl languages.'
);
assert(isRecognizedProseWord(0, 'message'), 'A common English word must match exactly.');
assert(isRecognizedProseWord(0, 'becasue'), 'A single adjacent-letter typo must match.');
assert(!isRecognizedProseWord(0, 'qxzvplm'), 'Random consonant noise must not match.');

const english = evaluateTldrMessage(
  'This message contains several ordinary words becasue we are testing real language today.',
  0,
  parameters
);
assert(english.qualifies, 'Natural English prose with one spelling error should qualify.');
assert(english.recognizedRatio >= 0.9, 'The English fixture should retain at least 90% recognized words.');

const german = evaluateTldrMessage(
  'Diese Nachricht ist absichtlich deutlich länger als fünfzig Zeichen.',
  1,
  parameters
);
assert(german.qualifies, 'Natural German prose should qualify with the integer 90% threshold.');

const spanish = evaluateTldrMessage(
  'Este mensaje contiene varias palabras normales porque estamos probando lenguaje real hoy.',
  24,
  parameters
);
assert(spanish.qualifies, 'The detector must not be restricted to English and German.');

const repeatedNoise = evaluateTldrMessage(
  'qxzvplm qxzvplm qxzvplm qxzvplm qxzvplm qxzvplm qxzvplm qxzvplm',
  0,
  parameters
);
assert(!repeatedNoise.qualifies, 'Repeated random text must not qualify.');
assert(repeatedNoise.reason === 'too-many-repeated-words', 'Repeated noise should expose its rejection reason.');

const urlPadding = evaluateTldrMessage(
  'hello world https://example.com/this/is/a/very/long/path/that/is/not/a/real/message',
  0,
  parameters
);
assert(!urlPadding.qualifies, 'A long URL must not pad a two-word message into TL;DR completion.');

function textSubmitted(message: string, languageId = 0): TelemetryEvent {
  return {
    schemaVersion: 1,
    eventId: `tldr-${languageId}-${message.length}`,
    telemetrySequence: 1,
    type: 'TEXT_SUBMITTED',
    category: 'chat',
    occurredAt: 1_700_000_000_000,
    monotonicMs: 100,
    actor: { playerId: 1, name: 'Alpha', isSelf: true },
    context: {
      lobbySessionId: 'tldr-lobby-session',
      lobbyGeneration: 1,
      lobbyId: 'TLDR',
      lobbyType: 0,
      languageId,
      languageName: languageId === 0 ? 'English' : null,
      gameSessionId: 'tldr-game',
      roundSessionId: 'tldr-round',
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: 1,
      drawerId: 2
    },
    source: {
      origin: 'decoded-packet',
      rawRecordId: null,
      changeId: null,
      direction: 'client-to-server',
      socketEvent: 'data',
      packetId: 30
    },
    payload: { message, eligibleGuess: false },
    confidence: 'confirmed',
    highVolume: false
  };
}

const rejectedEngine = new ChallengeEngine({ autoPersist: false });
rejectedEngine.register(tldrDefinition);
rejectedEngine.activate({ instanceId: 'tldr-noise', challengeId: 'tldr' });
rejectedEngine.process(textSubmitted(repeatedNoise.words.join(' ')));
assert(rejectedEngine.getInstance('tldr-noise')?.status === 'active', 'Noise must stay uncompleted.');

const completedEngine = new ChallengeEngine({ autoPersist: false });
completedEngine.register(tldrDefinition);
completedEngine.activate({ instanceId: 'tldr-prose', challengeId: 'tldr' });
completedEngine.process(textSubmitted(
  'This message contains several ordinary words becasue we are testing real language today.'
));
assert(
  completedEngine.getInstance('tldr-prose')?.status === 'completion-pending',
  'Recognized prose must create a completion candidate.'
);

console.log('TL;DR offline prose detection runtime test passed.');
