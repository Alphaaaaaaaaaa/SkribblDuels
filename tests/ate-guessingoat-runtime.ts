import * as assert from 'node:assert/strict';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  ateAndLeftNoCrumbsDefinition,
  guessingOatDefinition,
  starterChallengeDefinitions
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent, TelemetryEventType } from '@skribbl-duels/telemetry-contracts';

let sequence = 0;
function event(
  type: TelemetryEventType,
  eventId: string,
  options: {
    roundSessionId?: string | null;
    drawerId?: number | null;
    payload?: Record<string, unknown>;
    actorPlayerId?: number | null;
    gameSessionId?: string | null;
  } = {}
): TelemetryEvent {
  sequence += 1;
  const roundSessionId = options.roundSessionId ?? null;
  const drawerId = options.drawerId ?? null;
  const gameSessionId = options.gameSessionId === undefined ? 'full-game' : options.gameSessionId;
  const actorPlayerId = options.actorPlayerId ?? null;
  const lifecycle = {
    previousStateId: type === 'GAME_STARTING' ? 0 : 4,
    stateId: type === 'GAME_STARTING' ? 1 : type === 'GAME_ENDED' ? 6 : type === 'ROUND_STARTED' ? 4 : 5,
    stateName: type === 'GAME_STARTING'
      ? 'GAME_STARTING'
      : type === 'GAME_ENDED'
        ? 'GAME_ENDED'
        : type === 'ROUND_STARTED'
          ? 'DRAWING'
          : 'ROUND_RESULTS',
    time: 10,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3
  };
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: sequence,
    type,
    category: type === 'FIRST_GUESS'
      ? 'guessing'
      : type === 'ROUND_RESULTS_AVAILABLE'
        ? 'score'
        : 'round',
    occurredAt: 1_800_000_000_000 + sequence * 100,
    monotonicMs: sequence * 100,
    actor: actorPlayerId === null ? null : {
      playerId: actorPlayerId,
      name: actorPlayerId === 21 ? 'Alpha' : 'Opponent',
      isSelf: actorPlayerId === 21
    },
    context: {
      lobbySessionId: 'public-lobby-session',
      lobbyGeneration: 1,
      lobbyId: 'PUBLIC',
      lobbyType: 0,
      languageId: 0,
      languageName: 'English',
      gameSessionId,
      roundSessionId,
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: lifecycle.stateId,
      gameStateName: lifecycle.stateName,
      meId: 21,
      drawerId
    },
    source: {
      origin: 'decoded-packet',
      rawRecordId: `raw-${eventId}`,
      changeId: null,
      direction: 'server-to-client',
      socketEvent: 'data',
      packetId: 10
    },
    payload: { ...lifecycle, ...(options.payload ?? {}) },
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEvent;
}

function engineFor(
  definition: typeof ateAndLeftNoCrumbsDefinition | typeof guessingOatDefinition,
  instanceId: string
): ChallengeEngine {
  const engine = new ChallengeEngine({ autoPersist: false, createId: () => `${instanceId}-candidate` });
  engine.register(definition);
  engine.activate({ instanceId, challengeId: definition.id });
  return engine;
}

function startRound(engine: ChallengeEngine, id: string, drawerId: number): void {
  engine.process(event('ROUND_STARTED', `${id}-start`, {
    roundSessionId: id,
    drawerId,
    payload: {
      drawerId,
      word: null,
      wordLengths: [4],
      initialTime: 80,
      players: [
        { id: 21, name: 'Alpha', avatar: [], score: 0, guessed: false, flags: 0 },
        { id: 31, name: 'Bravo', avatar: [], score: 0, guessed: false, flags: 0 }
      ]
    }
  }));
}

function resultRound(
  engine: ChallengeEngine,
  id: string,
  drawerId: number,
  selfRoundScore: number | null,
  reason = 1,
  reasonName = 'TIME_UP'
): void {
  const scores = selfRoundScore === null ? [] : [{ playerId: 21, totalScore: selfRoundScore, roundScore: selfRoundScore }];
  engine.process(event('ROUND_RESULTS_AVAILABLE', `${id}-result`, {
    roundSessionId: id,
    drawerId,
    payload: { reason, reasonName, word: 'test', scores }
  }));
}

function firstGuess(engine: ChallengeEngine, id: string, playerId: number): void {
  engine.process(event('FIRST_GUESS', `${id}-first-${playerId}`, {
    roundSessionId: id,
    drawerId: 31,
    actorPlayerId: playerId,
    payload: {
      playerId,
      position: 1,
      elapsedMs: 1_000,
      estimatedTimeAtGuess: 79,
      serverTimeAnchorAtGuess: 80,
      includesWord: true,
      word: 'test',
      wrongGuessesBeforeCorrect: 0,
      isFirstGuesser: true
    }
  }));
}

assert.equal(starterChallengeDefinitions.length, 53, 'The growing live pool must retain Challenges 48–50 when Challenges 51–53 are added.');
assert.equal(ateAndLeftNoCrumbsDefinition.metadata.rankedEligible, false);
assert.equal(guessingOatDefinition.metadata.rankedEligible, false);

const ate = engineFor(ateAndLeftNoCrumbsDefinition, 'ate');
ate.process(event('GAME_STARTING', 'ate-game-start'));
startRound(ate, 'ate-foreign', 31);
resultRound(ate, 'ate-foreign', 31, 120);
startRound(ate, 'ate-self', 21);
resultRound(ate, 'ate-self', 21, 75);
startRound(ate, 'ate-interrupted', 31);
resultRound(ate, 'ate-interrupted', 31, null, 2, 'DRAWER_LEFT');
ate.process(event('GAME_ENDED', 'ate-game-end', { payload: { finalScores: [] } }));
assert.equal(ate.getInstance('ate')?.status, 'completion-pending', 'Positive points in every regular turn must complete Ate.');
assert.equal(
  ate.getInstance('ate')?.completionCandidate?.evidenceEventIds.includes('ate-self-result'),
  true,
  'An own drawing turn is part of Ate and must be present in evidence.'
);

for (const missingScore of [0, null] as const) {
  const failed = engineFor(ateAndLeftNoCrumbsDefinition, `ate-failed-${String(missingScore)}`);
  failed.process(event('GAME_STARTING', `ate-failed-${String(missingScore)}-start`));
  startRound(failed, `ate-failed-${String(missingScore)}-round`, 31);
  resultRound(failed, `ate-failed-${String(missingScore)}-round`, 31, missingScore);
  failed.process(event('GAME_ENDED', `ate-failed-${String(missingScore)}-end`, { payload: { finalScores: [] } }));
  assert.equal(failed.getInstance(`ate-failed-${String(missingScore)}`)?.status, 'active', 'Zero and missing self scores must fail closed.');
}

const ateMidGame = engineFor(ateAndLeftNoCrumbsDefinition, 'ate-mid-game');
startRound(ateMidGame, 'ate-mid-game-round', 31);
resultRound(ateMidGame, 'ate-mid-game-round', 31, 100);
ateMidGame.process(event('GAME_ENDED', 'ate-mid-game-end', { payload: { finalScores: [] } }));
assert.equal(ateMidGame.getInstance('ate-mid-game')?.status, 'active', 'Joining mid-game cannot certify a full-game challenge.');

const oat = engineFor(guessingOatDefinition, 'oat');
oat.process(event('GAME_STARTING', 'oat-game-start'));
startRound(oat, 'oat-foreign-a', 31);
firstGuess(oat, 'oat-foreign-a', 21);
resultRound(oat, 'oat-foreign-a', 31, 100);
startRound(oat, 'oat-self', 21);
resultRound(oat, 'oat-self', 21, 50);
startRound(oat, 'oat-interrupted', 31);
resultRound(oat, 'oat-interrupted', 31, null, 2, 'DRAWER_LEFT');
startRound(oat, 'oat-foreign-b', 31);
firstGuess(oat, 'oat-foreign-b', 21);
resultRound(oat, 'oat-foreign-b', 31, 100);
oat.process(event('GAME_ENDED', 'oat-game-end', { payload: { finalScores: [] } }));
assert.equal(oat.getInstance('oat')?.status, 'completion-pending', 'First Guesser in every regular foreign turn must complete GuessingOAT.');

const otherFirst = engineFor(guessingOatDefinition, 'oat-other-first');
otherFirst.process(event('GAME_STARTING', 'oat-other-first-start'));
startRound(otherFirst, 'oat-other-first-round', 31);
firstGuess(otherFirst, 'oat-other-first-round', 32);
resultRound(otherFirst, 'oat-other-first-round', 31, 100);
otherFirst.process(event('GAME_ENDED', 'oat-other-first-end', { payload: { finalScores: [] } }));
assert.equal(otherFirst.getInstance('oat-other-first')?.status, 'active', 'Another First Guesser must fail the full game.');

const noFirst = engineFor(guessingOatDefinition, 'oat-no-first');
noFirst.process(event('GAME_STARTING', 'oat-no-first-start'));
startRound(noFirst, 'oat-no-first-round', 31);
resultRound(noFirst, 'oat-no-first-round', 31, 0);
noFirst.process(event('GAME_ENDED', 'oat-no-first-end', { payload: { finalScores: [] } }));
assert.equal(noFirst.getInstance('oat-no-first')?.status, 'active', 'A regular foreign turn without a First Guesser must fail closed.');

const oatMidGame = engineFor(guessingOatDefinition, 'oat-mid-game');
startRound(oatMidGame, 'oat-mid-game-round', 31);
firstGuess(oatMidGame, 'oat-mid-game-round', 21);
resultRound(oatMidGame, 'oat-mid-game-round', 31, 100);
oatMidGame.process(event('GAME_ENDED', 'oat-mid-game-end', { payload: { finalScores: [] } }));
assert.equal(oatMidGame.getInstance('oat-mid-game')?.status, 'active', 'GuessingOAT cannot start from a mid-game join.');

const ateAutomaticRestart = engineFor(ateAndLeftNoCrumbsDefinition, 'ate-auto-restart');
ateAutomaticRestart.process(event('ROUND_ANNOUNCED', 'ate-auto-restart-banner', {
  payload: { previousStateId: 6, stateId: 2, stateName: 'ROUND_ANNOUNCEMENT' }
}));
startRound(ateAutomaticRestart, 'ate-auto-turn', 31);
resultRound(ateAutomaticRestart, 'ate-auto-turn', 31, 100);
ateAutomaticRestart.process(event('GAME_ENDED', 'ate-auto-end', { payload: { finalScores: [] } }));
assert.equal(
  ateAutomaticRestart.getInstance('ate-auto-restart')?.status,
  'completion-pending',
  'A direct results-to-round-one banner must establish a fully observed automatic-restart game for Ate.'
);

const oatAutomaticRestart = engineFor(guessingOatDefinition, 'oat-auto-restart');
oatAutomaticRestart.process(event('ROUND_ANNOUNCED', 'oat-auto-restart-banner', {
  payload: { previousStateId: 6, stateId: 2, stateName: 'ROUND_ANNOUNCEMENT' }
}));
startRound(oatAutomaticRestart, 'oat-auto-turn', 31);
firstGuess(oatAutomaticRestart, 'oat-auto-turn', 21);
resultRound(oatAutomaticRestart, 'oat-auto-turn', 31, 100);
oatAutomaticRestart.process(event('GAME_ENDED', 'oat-auto-end', { payload: { finalScores: [] } }));
assert.equal(
  oatAutomaticRestart.getInstance('oat-auto-restart')?.status,
  'completion-pending',
  'A direct results-to-round-one banner must establish a fully observed automatic-restart game for GuessingOAT.'
);

console.log('Ate and left no crumbs / GuessingOAT deterministic full-game runtime tests passed.');
