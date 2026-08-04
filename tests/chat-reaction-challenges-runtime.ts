import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  asCloseAsItGetsDefinition,
  paparazzidDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseContext = {
  lobbySessionId: 'chat-lobby-session',
  lobbyGeneration: 1,
  lobbyId: 'CHAT1',
  lobbyType: 0,
  languageId: 1,
  languageName: 'German',
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  gameStateId: 4,
  gameStateName: 'DRAWING',
  meId: 21,
  drawerId: 77
} as const;

function event<T extends TelemetryEvent['type']>(
  type: T,
  eventId: string,
  monotonicMs: number,
  actor: TelemetryEvent['actor'],
  payload: Extract<TelemetryEvent, { type: T }>['payload']
): Extract<TelemetryEvent, { type: T }> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category: type === 'CHAT_MESSAGE_RECEIVED' ? 'chat' : type === 'LOBBY_HYDRATED' ? 'lobby' : type === 'ROUND_STARTED' ? 'round' : 'guessing',
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor,
    context: { ...baseContext },
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

const paparazzi = new ChallengeEngine({ autoPersist: false });
paparazzi.register(paparazzidDefinition);
paparazzi.activate({ instanceId: 'paparazzi', challengeId: 'paparazzid' });
paparazzi.process(event('LOBBY_HYDRATED', 'pap-hydrate', 1, null, {
  lobbyId: 'CHAT1',
  playerCount: 2,
  stateName: 'DRAWING',
  lobbyGeneration: 1,
  languageId: 1,
  languageName: 'German',
  meId: 21,
  ownerId: 77,
  roundIndex: 0,
  roundNumber: 1,
  players: [
    { id: 21, name: 'Alpha', avatar: [1, 2, 3, -1], score: 0, guessed: false, flags: 0 },
    { id: 77, name: 'Reporter', avatar: [2, 3, 4, -1], score: 0, guessed: false, flags: 0 }
  ]
}));
paparazzi.process(event('CHAT_MESSAGE_RECEIVED', 'pap-substring', 2, {
  playerId: 77, name: 'Reporter', isSelf: false
}, {
  playerId: 77,
  message: 'Das Alphabet ist lang.',
  countedAsWrongGuess: false
}));
assert(paparazzi.getInstance('paparazzi')?.progress.current === 0, 'A name substring inside another word must not count.');
paparazzi.process(event('CHAT_MESSAGE_RECEIVED', 'pap-self', 3, {
  playerId: 21, name: 'Alpha', isSelf: true
}, {
  playerId: 21,
  message: 'Alpha',
  countedAsWrongGuess: false
}));
assert(paparazzi.getInstance('paparazzi')?.progress.current === 0, 'A self message must not count.');
paparazzi.process(event('CHAT_MESSAGE_RECEIVED', 'pap-mention', 4, {
  playerId: 77, name: 'Reporter', isSelf: false
}, {
  playerId: 77,
  message: 'Hey @Alpha, stark!',
  countedAsWrongGuess: false
}));
assert(paparazzi.getInstance('paparazzi')?.status === 'completion-pending', 'A whole-name mention by another player should complete Paparazzi.');

const close = new ChallengeEngine({ autoPersist: false });
close.register(asCloseAsItGetsDefinition);
close.activate({ instanceId: 'close', challengeId: 'as-close-as-it-gets' });
close.process(event('ROUND_STARTED', 'close-round', 1000, null, {
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId: 77,
  word: null,
  wordLengths: [5],
  initialTime: 80
}));
close.process(event('CLOSE_GUESS', 'close-baseline', 2000, {
  playerId: 21, name: 'Alpha', isSelf: true
}, { word: 'Punk' }));
close.process(event('GUESS_SUBMITTED', 'close-next-submit', 2120, {
  playerId: 21, name: 'Alpha', isSelf: true
}, { message: 'Punkt', submittedAtServerTime: 79 }));
close.process(event('CORRECT_GUESS', 'close-correct', 2500, {
  playerId: 21, name: 'Alpha', isSelf: true
}, {
  playerId: 21,
  position: 2,
  elapsedMs: 2500,
  estimatedTimeAtGuess: 77.5,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Punkt',
  wrongGuessesBeforeCorrect: 1,
  isFirstGuesser: false
}));
assert(close.getInstance('close')?.status === 'completion-pending', 'Exactly 500 ms after a close guess should complete.');

const broken = new ChallengeEngine({ autoPersist: false });
broken.register(asCloseAsItGetsDefinition);
broken.activate({ instanceId: 'broken', challengeId: 'as-close-as-it-gets' });
broken.process(event('ROUND_STARTED', 'broken-round', 3000, null, {
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId: 77,
  word: null,
  wordLengths: [5],
  initialTime: 80
}));
broken.process(event('CLOSE_GUESS', 'broken-close', 3100, {
  playerId: 21, name: 'Alpha', isSelf: true
}, { word: 'Punk' }));
broken.process(event('GUESS_SUBMITTED', 'broken-wrong-submit', 3200, {
  playerId: 21, name: 'Alpha', isSelf: true
}, { message: 'Punkte', submittedAtServerTime: 79 }));
broken.process(event('GUESS_SUBMITTED', 'broken-correct-submit', 3300, {
  playerId: 21, name: 'Alpha', isSelf: true
}, { message: 'Punkt', submittedAtServerTime: 78 }));
broken.process(event('CORRECT_GUESS', 'broken-correct', 3400, {
  playerId: 21, name: 'Alpha', isSelf: true
}, {
  playerId: 21,
  position: 2,
  elapsedMs: 3400,
  estimatedTimeAtGuess: 76.6,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Punkt',
  wrongGuessesBeforeCorrect: 2,
  isFirstGuesser: false
}));
assert(broken.getInstance('broken')?.progress.current === 0, 'An intervening additional guess must break the close chain.');

console.log('Paparazzi and close-reaction challenge runtime test passed.');
