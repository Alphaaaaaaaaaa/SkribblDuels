import { Subject } from 'rxjs';
import { LobbyStateStore, TelemetryStore, type DecodedSocketRecord } from '@skribbl-duels/telemetry-core';

let sequence = 0;
function record(kind: string, payload: unknown, packetId: number): DecodedSocketRecord {
  sequence += 1;
  return {
    rawRecordId: `raw-${sequence}`,
    sessionId: 'test-session',
    sequence,
    occurredAt: 1000 + sequence * 100,
    monotonicMs: sequence * 100,
    decoded: {
      known: true,
      kind,
      direction: 'server-to-client',
      socketEvent: 'data',
      packetId,
      payload,
      issues: [],
      rawData: payload
    }
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const decoded$ = new Subject<DecodedSocketRecord>();
const lobby = new LobbyStateStore(decoded$);
const telemetry = new TelemetryStore(decoded$, lobby.changes$, lobby);

decoded$.next(record('LOBBY_DATA', {
  lobby: {
    settings: [1, 8, 80, 3, 3, 2, 0, 0],
    languageId: 1,
    languageName: 'German',
    lobbyId: 'TEST1234',
    lobbyType: 0,
    meId: 21,
    ownerId: -1,
    users: [
      { id: 17, name: 'Drawer', avatar: [0, 1, 2, -1], score: 0, guessed: false, flags: 0 },
      { id: 21, name: 'Alpha', avatar: [0, 2, 17, -1], score: 0, guessed: false, flags: 0 }
    ],
    round: 0,
    state: {
      stateId: 2,
      stateName: 'ROUND_ANNOUNCEMENT',
      time: 2,
      round: 0,
      rawData: 0
    }
  }
}, 10));

let state = lobby.getSnapshot();
assert(state.serverRoundIndex === 0, 'Server round index should remain zero-based.');
assert(state.round === 1, 'Human-readable round should be one-based.');
assert(state.game.gameSessionId !== null, 'Hydration should establish a game session ID.');
assert(state.game.roundSessionId === null, 'Round announcement alone should not create a drawing-turn session ID.');

decoded$.next(record('GAME_STATE_UPDATE', {
  state: {
    stateId: 4,
    stateName: 'DRAWING',
    time: 80,
    drawerId: 17,
    word: [5],
    hints: [],
    drawCommands: [],
    rawData: {}
  }
}, 11));

const firstDrawingTurnSessionId = lobby.getSnapshot().game.roundSessionId;
assert(firstDrawingTurnSessionId !== null, 'Entering drawing should create a drawing-turn session ID.');

decoded$.next(record('TIME_UPDATED', { time: 32 }, 14));
decoded$.next(record('PLAYER_GUESSED', {
  playerId: 21,
  word: 'Nagel',
  includesWord: true
}, 15));

decoded$.next(record('GAME_STATE_UPDATE', {
  state: {
    stateId: 5,
    stateName: 'ROUND_RESULTS',
    time: 3,
    reason: 0,
    reasonName: 'EVERYONE_GUESSED',
    word: 'Nagel',
    scores: [
      { playerId: 17, totalScore: 360, roundScore: 360 },
      { playerId: 21, totalScore: 425, roundScore: 425 }
    ],
    rawScores: [17, 360, 360, 21, 425, 425],
    rawData: {}
  }
}, 11));

state = lobby.getSnapshot();
assert(state.round === 1, 'Round number should remain one-based throughout the round.');
assert(state.users['21']?.score === 425, 'Round result should update total score.');


// A visible server round contains multiple drawer turns. Each turn must receive
// a new roundSessionId even while roundIndex/roundNumber stay unchanged.
decoded$.next(record('GAME_STATE_UPDATE', {
  state: {
    stateId: 3,
    stateName: 'WORD_SELECTION',
    time: 15,
    drawerId: 21,
    availableWords: ['A', 'B', 'C'],
    rawData: {}
  }
}, 11));
const secondTurnSelectionId = lobby.getSnapshot().game.roundSessionId;
assert(secondTurnSelectionId !== null, 'Word selection should create the next drawing-turn session ID.');
assert(secondTurnSelectionId !== firstDrawingTurnSessionId, 'A new drawer turn must receive a fresh session ID.');

decoded$.next(record('GAME_STATE_UPDATE', {
  state: {
    stateId: 4,
    stateName: 'DRAWING',
    time: 80,
    drawerId: 21,
    word: 'Test',
    hints: [],
    drawCommands: [],
    rawData: {}
  }
}, 11));
state = lobby.getSnapshot();
assert(state.game.roundSessionId === secondTurnSelectionId, 'Word selection and drawing must share one turn session ID.');
assert(state.serverRoundIndex === 0 && state.round === 1, 'Changing drawers must not change the visible server round.');


decoded$.next(record('GAME_STATE_UPDATE', {
  state: {
    stateId: 6,
    stateName: 'GAME_RESULTS',
    time: 10,
    rawData: {}
  }
}, 11));

const gameEnded = telemetry.getByType('GAME_ENDED')[0];
assert(gameEnded, 'Telemetry should emit GAME_ENDED.');
assert(
  gameEnded.payload.finalScores?.some(score => score.playerId === 21 && score.totalScore === 425),
  'GAME_ENDED should include the final self score snapshot.'
);

const types = telemetry.getRecent().map(event => event.type);
assert(types.includes('ROUND_STARTED'), 'Telemetry should emit ROUND_STARTED.');
assert(types.includes('CORRECT_GUESS'), 'Telemetry should emit CORRECT_GUESS.');
assert(types.includes('FIRST_GUESS'), 'Telemetry should emit FIRST_GUESS.');
assert(types.includes('SCORE_CHANGED'), 'Telemetry should emit SCORE_CHANGED.');
assert(types.includes('ROUND_ENDED'), 'Telemetry should emit ROUND_ENDED.');

const correctGuess = telemetry.getByType('CORRECT_GUESS')[0];
assert(correctGuess?.context.roundNumber === 1, 'Telemetry context should expose one-based round number.');
assert(correctGuess?.context.roundIndex === 0, 'Telemetry context should preserve raw round index.');

console.log('Telemetry smoke test passed.');
