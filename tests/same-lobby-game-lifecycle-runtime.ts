import { Subject } from 'rxjs';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { backToBackDefinition } from '@skribbl-duels/challenge-definitions';
import {
  LobbyStateStore,
  TelemetryStore,
  type DecodedSocketRecord
} from '@skribbl-duels/telemetry-core';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let sequence = 0;
function record(kind: string, payload: unknown, packetId = 11): DecodedSocketRecord {
  sequence += 1;
  return {
    rawRecordId: `same-lobby-game-${sequence}`,
    sessionId: 'same-lobby-runtime',
    sequence,
    occurredAt: 1_000 + sequence * 100,
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

function roundResults(selfScore: number, opponentScore: number, round: number): unknown {
  return {
    state: {
      stateId: 5,
      stateName: 'ROUND_RESULTS',
      time: 3,
      reason: 1,
      reasonName: 'TIME_UP',
      word: 'test',
      scores: [
        { playerId: 21, totalScore: selfScore, roundScore: 250 },
        { playerId: 22, totalScore: opponentScore, roundScore: 200 }
      ],
      rawScores: [21, selfScore, 250, 22, opponentScore, 200],
      rawData: { round }
    }
  };
}

const decoded$ = new Subject<DecodedSocketRecord>();
const lobby = new LobbyStateStore(decoded$);
const telemetry = new TelemetryStore(decoded$, lobby.changes$, lobby);
const engine = new ChallengeEngine({ autoPersist: false });
engine.register(backToBackDefinition);
engine.activate({ instanceId: 'same-lobby-back-to-back', challengeId: 'back-to-back' });
const telemetrySubscription = telemetry.events$.subscribe(event => engine.process(event));

// Hydrate midway through the first game. Back to back intentionally allows the
// first observed win to come from a game whose start was not seen.
decoded$.next(record('LOBBY_DATA', {
  lobby: {
    settings: [0, 8, 80, 3, 3, 2, 0, 0],
    languageId: 0,
    languageName: 'English',
    lobbyId: 'SAMEGAME',
    lobbyType: 0,
    meId: 21,
    ownerId: -1,
    users: [
      { id: 21, name: 'Alpha', avatar: [0, 0, 0, -1], score: 900, guessed: false, flags: 0 },
      { id: 22, name: 'Beta', avatar: [1, 0, 0, -1], score: 850, guessed: false, flags: 0 }
    ],
    round: 2,
    state: {
      stateId: 2,
      stateName: 'ROUND_ANNOUNCEMENT',
      time: 2,
      round: 2,
      rawData: 2
    }
  }
}, 10));

const firstGameSessionId = lobby.getSnapshot().game.gameSessionId;
assert(firstGameSessionId !== null, 'Hydration inside a running game must establish a game session ID.');
decoded$.next(record('GAME_STATE_UPDATE', roundResults(1_250, 1_100, 2)));
decoded$.next(record('GAME_STATE_UPDATE', {
  state: { stateId: 6, stateName: 'GAME_RESULTS', time: 10, rawData: [] }
}));
assert(
  engine.getInstance('same-lobby-back-to-back')?.progress.current === 1,
  'The first same-lobby win should count even when the game was joined in progress.'
);

// Public lobbies may go straight from results to the next round-one banner.
// That transition still has to create a fresh gameSessionId.
decoded$.next(record('GAME_STATE_UPDATE', {
  state: {
    stateId: 2,
    stateName: 'ROUND_ANNOUNCEMENT',
    time: 2,
    round: 0,
    rawData: 0
  }
}));
const secondGameSessionId = lobby.getSnapshot().game.gameSessionId;
assert(secondGameSessionId !== null, 'The automatic restart must retain a non-null game session ID.');
assert(
  secondGameSessionId !== firstGameSessionId,
  'Leaving state 6 for the next round-one banner must create a new game session ID.'
);

decoded$.next(record('GAME_STATE_UPDATE', roundResults(1_400, 1_300, 2)));
decoded$.next(record('GAME_STATE_UPDATE', {
  state: { stateId: 6, stateName: 'GAME_RESULTS', time: 10, rawData: [] }
}));

const instance = engine.getInstance('same-lobby-back-to-back');
assert(
  instance?.status === 'completion-pending',
  'Two distinct winning game results in the same lobby must complete Back to back.'
);
assert(
  instance.completionCandidate?.evidenceEventIds.length === 2,
  'Back to back must retain one GAME_ENDED evidence event per distinct game session.'
);
assert(
  telemetry.getByType('GAME_ENDED')
    .sort((left, right) => left.telemetrySequence - right.telemetrySequence)
    .map(event => event.context.gameSessionId)
    .join('|')
    === `${firstGameSessionId}|${secondGameSessionId}`,
  'The telemetry stream must expose the two same-lobby GAME_ENDED events under distinct session IDs.'
);

telemetrySubscription.unsubscribe();
telemetry.destroy();
lobby.destroy();

console.log('Same-lobby automatic game restart and Back to back runtime test passed.');
