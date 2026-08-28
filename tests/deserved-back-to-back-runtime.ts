import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  backToBackDefinition,
  deservedDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent, TelemetryEventType } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const self = { playerId: 21, name: 'Alpha', isSelf: true } as const;
const other = { playerId: 62, name: 'Beta', isSelf: false } as const;

function context(
  gameSessionId: string | null,
  lobbyId = 'PROGRESS1',
  gameStateId = 4,
  gameStateName = 'DRAWING'
) {
  return {
    lobbySessionId: `session-${lobbyId}`,
    lobbyGeneration: 1,
    lobbyId,
    lobbyType: 0,
    languageId: 1,
    languageName: 'German',
    gameSessionId,
    roundSessionId: gameSessionId ? `${gameSessionId}-turn` : null,
    roundIndex: 1,
    roundNumber: 2,
    maxRounds: 3,
    gameStateId,
    gameStateName,
    meId: 21,
    drawerId: 77
  } as const;
}

function event<T extends TelemetryEventType>(
  type: T,
  eventId: string,
  monotonicMs: number,
  payload: Extract<TelemetryEvent, { type: T }>['payload'],
  gameSessionId: string | null,
  actor: TelemetryEvent['actor'] = null,
  lobbyId = 'PROGRESS1',
  gameStateId = 4,
  gameStateName = 'DRAWING'
): Extract<TelemetryEvent, { type: T }> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category: type === 'SCORE_CHANGED' ? 'score' : type === 'FIRST_GUESS' ? 'guessing' : type.includes('LOBBY') ? 'lobby' : 'round',
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor,
    context: context(gameSessionId, lobbyId, gameStateId, gameStateName),
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

const midGamePlayers = [
  { id: 21, name: 'Alpha', avatar: [1, 2, 3, -1], score: 300, guessed: false, flags: 0 },
  { id: 62, name: 'Beta', avatar: [2, 3, 4, -1], score: 900, guessed: false, flags: 0 },
  { id: 63, name: 'Gamma', avatar: [3, 4, 5, -1], score: 700, guessed: false, flags: 0 }
];

const hydrationPayload = {
  lobbyId: 'PROGRESS1',
  playerCount: 3,
  stateName: 'DRAWING',
  lobbyGeneration: 1,
  languageId: 1,
  languageName: 'German',
  meId: 21,
  ownerId: 62,
  roundIndex: 1,
  roundNumber: 2,
  players: midGamePlayers
};

const scorePayload = (playerId: number, previousScore: number, totalScore: number) => ({
  playerId,
  previousScore,
  totalScore,
  roundScore: totalScore - previousScore,
  delta: totalScore - previousScore,
  coolNumber: totalScore > 0 && totalScore % 250 === 0
});

const finalPayload = (selfScore: number, betaScore: number, gammaScore = 0) => ({
  previousStateId: 5,
  stateId: 6,
  stateName: 'GAME_ENDED',
  time: 0,
  roundIndex: 2,
  roundNumber: 3,
  maxRounds: 3,
  finalScores: [
    { playerId: 21, totalScore: selfScore, roundScore: 0 },
    { playerId: 62, totalScore: betaScore, roundScore: 0 },
    { playerId: 63, totalScore: gammaScore, roundScore: 0 }
  ]
});

const roundResultsPayload = (scores: Array<{ playerId: number; roundScore: number; totalScore: number }>) => ({
  previousStateId: 4,
  stateId: 5,
  stateName: 'ROUND_ENDED',
  time: 0,
  roundIndex: 1,
  roundNumber: 2,
  maxRounds: 3,
  reason: 0,
  reasonName: 'TIME_UP',
  word: 'Punkt',
  scores
});

const deserved = new ChallengeEngine({ autoPersist: false });
deserved.register(deservedDefinition);
deserved.activate({ instanceId: 'deserved', challengeId: 'deserved' });
deserved.process(event('LOBBY_HYDRATED', 'deserved-mid-game-hydrate', 1, hydrationPayload, 'deserved-game', null, 'PROGRESS1', 4, 'DRAWING'));
deserved.process(event('SCORE_CHANGED', 'deserved-self-catches-up', 10, scorePayload(21, 300, 901), 'deserved-game', self));
assert(
  deserved.getInstance('deserved')?.status === 'active',
  'A single score component must not certify Deserved before the scoreboard batch is coherent.'
);
deserved.process(event('ROUND_RESULTS_AVAILABLE', 'deserved-coherent-lead', 11, roundResultsPayload([
  { playerId: 21, roundScore: 601, totalScore: 901 },
  { playerId: 62, roundScore: 0, totalScore: 900 },
  { playerId: 63, roundScore: 0, totalScore: 700 }
]), 'deserved-game'));
assert(deserved.getInstance('deserved')?.status === 'completion-pending', 'Deserved should complete after a coherent strict positive lead in a game joined mid-progress.');

const zeroGuard = new ChallengeEngine({ autoPersist: false });
zeroGuard.register(deservedDefinition);
zeroGuard.activate({ instanceId: 'deserved', challengeId: 'deserved' });
zeroGuard.process(event('LOBBY_HYDRATED', 'zero-reset-hydrate', 20, {
  ...hydrationPayload,
  players: midGamePlayers.map(player => ({ ...player, score: 0 }))
}, 'zero-reset-game', null));
zeroGuard.process(event('SCORE_CHANGED', 'zero-reset-self', 21, scorePayload(21, 300, 0), 'zero-reset-game', self));
assert(zeroGuard.getInstance('deserved')?.status === 'active', 'A temporary all-zero scoreboard at round rollover must never complete Deserved.');

const partialRoundResults = new ChallengeEngine({ autoPersist: false });
partialRoundResults.register(deservedDefinition);
partialRoundResults.activate({ instanceId: 'deserved', challengeId: 'deserved' });
partialRoundResults.process(event('LOBBY_HYDRATED', 'partial-results-hydrate', 22, hydrationPayload, 'partial-results-game', null));
partialRoundResults.process(event('ROUND_RESULTS_AVAILABLE', 'partial-results-self-only', 23, {
  previousStateId: 4,
  stateId: 5,
  stateName: 'ROUND_ENDED',
  time: 0,
  roundIndex: 1,
  roundNumber: 2,
  maxRounds: 3,
  reason: 0,
  reasonName: 'time-up',
  word: 'Punkt',
  scores: [{ playerId: 21, roundScore: 50, totalScore: 350 }]
}, 'partial-results-game'));
assert(
  partialRoundResults.getInstance('deserved')?.status === 'active',
  'A partial round-result packet must retain higher-scoring players and cannot invent first place for Deserved.'
);

const tieRejected = new ChallengeEngine({ autoPersist: false });
tieRejected.register(deservedDefinition);
tieRejected.activate({ instanceId: 'deserved', challengeId: 'deserved' });
tieRejected.process(event('LOBBY_HYDRATED', 'tie-hydrate', 30, {
  ...hydrationPayload,
  players: [
    { ...midGamePlayers[0]!, score: 300 },
    { ...midGamePlayers[1]!, score: 500 },
    { ...midGamePlayers[2]!, score: 400 }
  ]
}, 'tie-game', null));
tieRejected.process(event('SCORE_CHANGED', 'tie-self-reaches-first', 31, scorePayload(21, 300, 500), 'tie-game', self));
tieRejected.process(event('ROUND_RESULTS_AVAILABLE', 'tie-coherent-ranking', 32, roundResultsPayload([
  { playerId: 21, roundScore: 200, totalScore: 500 },
  { playerId: 62, roundScore: 0, totalScore: 500 },
  { playerId: 63, roundScore: 0, totalScore: 400 }
]), 'tie-game'));
assert(tieRejected.getInstance('deserved')?.status === 'active', 'A positive tie for first place must not count for Deserved.');

const disqualified = new ChallengeEngine({ autoPersist: false });
disqualified.register(deservedDefinition);
disqualified.activate({ instanceId: 'deserved', challengeId: 'deserved' });
disqualified.process(event('LOBBY_HYDRATED', 'dq-mid-game-hydrate', 100, hydrationPayload, 'dq-game', null, 'PROGRESS1', 4, 'DRAWING'));
disqualified.process(event('FIRST_GUESS', 'dq-self-first-guesser', 110, {
  playerId: 21,
  position: 1,
  elapsedMs: 2000,
  estimatedTimeAtGuess: 78,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Punkt',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
}, 'dq-game', self));
disqualified.process(event('SCORE_CHANGED', 'dq-self-first-place', 120, scorePayload(21, 300, 901), 'dq-game', self));
disqualified.process(event('ROUND_RESULTS_AVAILABLE', 'dq-coherent-first-place', 121, roundResultsPayload([
  { playerId: 21, roundScore: 601, totalScore: 901 },
  { playerId: 62, roundScore: 0, totalScore: 900 },
  { playerId: 63, roundScore: 0, totalScore: 700 }
]), 'dq-game'));
assert(disqualified.getInstance('deserved')?.status === 'active', 'A self first guess after joining the current game must block Deserved.');

const resetGuard = new ChallengeEngine({ autoPersist: false });
resetGuard.register(deservedDefinition);
resetGuard.activate({ instanceId: 'deserved', challengeId: 'deserved' });
resetGuard.process(event('LOBBY_HYDRATED', 'reset-hydrate', 130, hydrationPayload, 'reset-game', null, 'PROGRESS1', 4, 'DRAWING'));
resetGuard.process(event('FIRST_GUESS', 'reset-old-game-first', 140, {
  playerId: 21,
  position: 1,
  elapsedMs: 1000,
  estimatedTimeAtGuess: 79,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Hai',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
}, 'reset-game', self));
resetGuard.process(event('SCORE_CHANGED', 'reset-beta-to-zero', 150, scorePayload(62, 900, 0), 'reset-game', other));
resetGuard.process(event('SCORE_CHANGED', 'reset-self-new-game-lead', 160, scorePayload(21, 0, 100), 'reset-game', self));
resetGuard.process(event('ROUND_RESULTS_AVAILABLE', 'reset-coherent-lead', 161, roundResultsPayload([
  { playerId: 21, roundScore: 100, totalScore: 100 },
  { playerId: 62, roundScore: 0, totalScore: 0 },
  { playerId: 63, roundScore: 0, totalScore: 0 }
]), 'reset-game'));
assert(resetGuard.getInstance('deserved')?.status === 'active', 'A round score reset must not erase the first-guesser disqualification for the current game.');

const backToBack = new ChallengeEngine({ autoPersist: false });
backToBack.register(backToBackDefinition);
backToBack.activate({ instanceId: 'b2b', challengeId: 'back-to-back' });
backToBack.process(event('GAME_ENDED', 'b2b-mid-game-win-1', 200, finalPayload(1200, 1100), 'b2b-game-1', null, 'PROGRESS1', 6, 'GAME_ENDED'));
assert(backToBack.getInstance('b2b')?.progress.current === 1, 'A first win may count even when GAME_STARTING was never observed.');
backToBack.process(event('GAME_ENDED', 'b2b-win-2', 210, finalPayload(1400, 1300), 'b2b-game-2', null, 'PROGRESS1', 6, 'GAME_ENDED'));
assert(backToBack.getInstance('b2b')?.status === 'completion-pending', 'A second consecutive win in the same lobby must complete Back to back even when its start was not observed.');

const lobbyRestricted = new ChallengeEngine({ autoPersist: false });
lobbyRestricted.register(backToBackDefinition);
lobbyRestricted.activate({ instanceId: 'b2b', challengeId: 'back-to-back' });
lobbyRestricted.process(event('GAME_ENDED', 'same-lobby-first-win', 300, finalPayload(1200, 1100), 'same-lobby-game-1', null, 'PROGRESS1', 6, 'GAME_ENDED'));
lobbyRestricted.process(event('LOBBY_CHANGED', 'leave-progress-lobby', 310, {
  previousLobbyId: 'PROGRESS1',
  lobbyId: 'PROGRESS2'
}, null, null, 'PROGRESS2', 0, 'LOBBY_WAITING'));
lobbyRestricted.process(event('GAME_ENDED', 'other-lobby-win', 320, finalPayload(1300, 1200), 'other-lobby-game-1', null, 'PROGRESS2', 6, 'GAME_ENDED'));
assert(lobbyRestricted.getInstance('b2b')?.progress.current === 1, 'Changing lobby must reset the streak, so the next win becomes only 1/2.');

const lossReset = new ChallengeEngine({ autoPersist: false });
lossReset.register(backToBackDefinition);
lossReset.activate({ instanceId: 'b2b', challengeId: 'back-to-back' });
lossReset.process(event('GAME_ENDED', 'loss-reset-win', 400, finalPayload(1200, 1100), 'loss-reset-game-1', null, 'PROGRESS1', 6, 'GAME_ENDED'));
lossReset.process(event('GAME_ENDED', 'loss-reset-loss', 410, finalPayload(900, 1000), 'loss-reset-game-2', null, 'PROGRESS1', 6, 'GAME_ENDED'));
assert(lossReset.getInstance('b2b')?.progress.current === 0, 'A loss in the same lobby must reset Back to back to 0/2.');

const zeroScore = new ChallengeEngine({ autoPersist: false });
zeroScore.register(backToBackDefinition);
zeroScore.activate({ instanceId: 'b2b', challengeId: 'back-to-back' });
zeroScore.process(event('GAME_ENDED', 'zero-score-tie', 500, finalPayload(0, 0), 'zero-score-game', null, 'PROGRESS1', 6, 'GAME_ENDED'));
assert(zeroScore.getInstance('b2b')?.progress.current === 0, 'A 0-point first-place tie must not count as a win.');

console.log('Deserved v5 and Back to back v6 runtime tests passed.');
