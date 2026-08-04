import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  pointsmaxxingDefinition,
  solitaryDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent, TelemetryEventType } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function context(roundSessionId: string, drawerId: number) {
  return {
    lobbySessionId: 'solo-points-lobby-session',
    lobbyGeneration: 1,
    lobbyId: 'SOLOPOINTS1',
    lobbyType: 0,
    languageId: 1,
    languageName: 'German',
    gameSessionId: 'solo-points-game',
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId
  } as const;
}

function event<T extends TelemetryEventType>(
  type: T,
  eventId: string,
  monotonicMs: number,
  payload: Extract<TelemetryEvent, { type: T }>['payload'],
  roundSessionId: string,
  drawerId: number,
  actor: TelemetryEvent['actor'] = null
): Extract<TelemetryEvent, { type: T }> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category: type === 'CORRECT_GUESS' ? 'guessing' : type === 'ROUND_ENDED' ? 'round' : 'round',
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor,
    context: context(roundSessionId, drawerId),
    source: {
      origin: 'decoded-packet',
      rawRecordId: null,
      changeId: null,
      direction: 'server-to-client',
      socketEvent: 'data',
      packetId: null
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as Extract<TelemetryEvent, { type: T }>;
}

const players = [
  { id: 21, name: 'Alpha', avatar: [], score: 100, guessed: false, flags: 0 },
  { id: 62, name: 'Beta', avatar: [], score: 200, guessed: false, flags: 0 },
  { id: 77, name: 'Drawer', avatar: [], score: 300, guessed: false, flags: 0 }
];

const roundStartPayload = (drawerId: number) => ({
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId,
  word: null,
  wordLengths: [5],
  initialTime: 80,
  players
});

const correctPayload = (playerId: number) => ({
  playerId,
  position: 1,
  elapsedMs: 5000,
  estimatedTimeAtGuess: 75,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Punkt',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
});

const roundEndPayload = (scores: { playerId: number; totalScore: number; roundScore: number }[]) => ({
  previousStateId: 4,
  stateId: 5,
  stateName: 'ROUND_RESULTS',
  time: 3,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  reason: 1,
  reasonName: 'TIME_UP',
  word: 'Punkt',
  scores
});

const solitary = new ChallengeEngine({ autoPersist: false });
solitary.register(solitaryDefinition);
solitary.activate({ instanceId: 'solitary', challengeId: 'solitary' });
solitary.process(event('ROUND_STARTED', 'solitary-start', 1, roundStartPayload(77), 'solitary-turn', 77));
solitary.process(event('CORRECT_GUESS', 'solitary-self-correct', 2, correctPayload(21), 'solitary-turn', 77, { playerId: 21, name: 'Alpha', isSelf: true }));
assert(solitary.getInstance('solitary')?.status === 'active', 'Solitary must wait until round end because another player may still guess.');
solitary.process(event('ROUND_ENDED', 'solitary-end', 3, roundEndPayload([
  { playerId: 21, totalScore: 450, roundScore: 350 },
  { playerId: 62, totalScore: 200, roundScore: 0 },
  { playerId: 77, totalScore: 500, roundScore: 200 }
]), 'solitary-turn', 77));
assert(solitary.getInstance('solitary')?.status === 'completion-pending', 'Solitary should complete when self was the only correct guesser at round end.');

const notSolitary = new ChallengeEngine({ autoPersist: false });
notSolitary.register(solitaryDefinition);
notSolitary.activate({ instanceId: 'solitary', challengeId: 'solitary' });
notSolitary.process(event('ROUND_STARTED', 'not-solitary-start', 10, roundStartPayload(77), 'not-solitary-turn', 77));
notSolitary.process(event('CORRECT_GUESS', 'not-solitary-self', 11, correctPayload(21), 'not-solitary-turn', 77, { playerId: 21, name: 'Alpha', isSelf: true }));
notSolitary.process(event('CORRECT_GUESS', 'not-solitary-other', 12, { ...correctPayload(62), position: 2, isFirstGuesser: false }, 'not-solitary-turn', 77, { playerId: 62, name: 'Beta', isSelf: false }));
notSolitary.process(event('ROUND_ENDED', 'not-solitary-end', 13, roundEndPayload([]), 'not-solitary-turn', 77));
assert(notSolitary.getInstance('solitary')?.status === 'active', 'Solitary must not complete when any second player also guessed correctly.');

const points = new ChallengeEngine({ autoPersist: false });
points.register(pointsmaxxingDefinition);
points.activate({ instanceId: 'points', challengeId: 'pointsmaxxing' });
points.process(event('ROUND_STARTED', 'points-start-450', 20, roundStartPayload(21), 'points-turn-450', 21));
points.process(event('ROUND_ENDED', 'points-end-450', 21, roundEndPayload([
  { playerId: 21, totalScore: 1000, roundScore: 450 },
  { playerId: 62, totalScore: 900, roundScore: 300 }
]), 'points-turn-450', 21));
assert(points.getInstance('points')?.status === 'active', 'Exactly 450 points must not complete Pointsmaxxing.');
points.process(event('ROUND_STARTED', 'points-start-451', 22, roundStartPayload(21), 'points-turn-451', 21));
points.process(event('ROUND_ENDED', 'points-end-451', 23, roundEndPayload([
  { playerId: 21, totalScore: 1451, roundScore: 451 },
  { playerId: 62, totalScore: 1200, roundScore: 300 }
]), 'points-turn-451', 21));
assert(points.getInstance('points')?.status === 'completion-pending', '451 points on an own drawing should complete Pointsmaxxing.');

console.log('Solitary and Pointsmaxxing runtime tests passed.');
