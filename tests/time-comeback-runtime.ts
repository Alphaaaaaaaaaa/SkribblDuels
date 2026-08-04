import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { timeWasteDefinition, ultimateComebackDefinition } from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const context = {
  lobbySessionId: 'lobby', lobbyGeneration: 1, lobbyId: 'Lobby123', lobbyType: 0,
  languageId: 1, languageName: 'German', gameSessionId: 'game', roundSessionId: 'round',
  roundIndex: 0, roundNumber: 1, maxRounds: 3, gameStateId: 4,
  gameStateName: 'DRAWING', meId: 21, drawerId: 88
};
const base = {
  schemaVersion: 1 as const, telemetrySequence: 1, occurredAt: 1, monotonicMs: 1,
  actor: null, context,
  source: { origin: 'system' as const, rawRecordId: null, changeId: null, direction: null, socketEvent: null, packetId: null },
  confidence: 'confirmed' as const, highVolume: false
};

const timeEngine = new ChallengeEngine({ autoPersist: false });
timeEngine.register(timeWasteDefinition);
timeEngine.activate({ instanceId: 'time', challengeId: 'time-waste' });
timeEngine.process({ ...base, eventId: 'short', type: 'CANVAS_METRICS', category: 'drawing', payload: { width: 800, height: 600, totalPixels: 480000, whitePixels: 480000, nonWhitePixels: 0, whiteRatio: 1, validStrokeCount: 0, trigger: 'continuous-white-duration', whiteDurationMs: 59999 } } as TelemetryEvent);
assert(timeEngine.getInstance('time')?.progress.current === 0, '59.999 seconds must not complete Time Waste.');
timeEngine.process({ ...base, eventId: 'enough', type: 'CANVAS_METRICS', category: 'drawing', payload: { width: 800, height: 600, totalPixels: 480000, whitePixels: 480000, nonWhitePixels: 0, whiteRatio: 1, validStrokeCount: 0, trigger: 'continuous-white-duration', whiteDurationMs: 60000 } } as TelemetryEvent);
assert(timeEngine.getInstance('time')?.status === 'completion-pending', '60 seconds should complete Time Waste.');

function hydration(players: any[]): TelemetryEvent {
  return { ...base, eventId: 'hydrate', type: 'LOBBY_HYDRATED', category: 'lobby', payload: { lobbyId: 'Lobby123', playerCount: players.length, stateName: 'DRAWING', lobbyGeneration: 1, languageId: 1, languageName: 'German', meId: 21, ownerId: -1, roundIndex: 0, roundNumber: 1, players } } as TelemetryEvent;
}

function score(eventId: string, playerId: number, name: string, previousScore: number, totalScore: number, isSelf = false): TelemetryEvent {
  return { ...base, eventId, type: 'SCORE_CHANGED', category: 'score', actor: { playerId, name, isSelf }, payload: { playerId, previousScore, totalScore, roundScore: totalScore - previousScore, delta: totalScore - previousScore, coolNumber: false } } as TelemetryEvent;
}

const players = [
  { id: 21, name: 'Alpha', avatar: [], score: 100, guessed: false, flags: 0 },
  { id: 61, name: 'BaselineTarget', avatar: [], score: 1400, guessed: false, flags: 0 },
  { id: 62, name: 'FastClimber', avatar: [], score: 1200, guessed: false, flags: 0 }
];

const comebackEngine = new ChallengeEngine({ autoPersist: false });
comebackEngine.register(ultimateComebackDefinition);
comebackEngine.activate({ instanceId: 'comeback', challengeId: 'ultimate-comeback' });
comebackEngine.process(hydration(players));
comebackEngine.process(score('fast-climber-first', 62, 'FastClimber', 1200, 1600));
comebackEngine.process(score('target-overtaken', 21, 'Alpha', 100, 1401, true));
assert(comebackEngine.getInstance('comeback')?.status === 'active', 'Overtaking an eligible baseline target while still #2 must not complete.');
assert((comebackEngine.getInstance('comeback')?.internalState as { overtakenEligibleTargetIds?: number[] }).overtakenEligibleTargetIds?.includes(61), 'The eligible target overtake milestone must persist.');
comebackEngine.process(score('self-first', 21, 'Alpha', 1401, 1601, true));
assert(comebackEngine.getInstance('comeback')?.status === 'completion-pending', 'Becoming strict #1 later must complete even when the displaced leader was not a baseline target.');

const joinedLeaderEngine = new ChallengeEngine({ autoPersist: false });
joinedLeaderEngine.register(ultimateComebackDefinition);
joinedLeaderEngine.activate({ instanceId: 'joined', challengeId: 'ultimate-comeback' });
joinedLeaderEngine.process(hydration(players.slice(0, 2)));
joinedLeaderEngine.process({ ...base, eventId: 'late-join', type: 'PLAYER_JOINED', category: 'lobby', actor: { playerId: 70, name: 'LateJoiner', isSelf: false }, payload: { user: { id: 70, name: 'LateJoiner', avatar: [], score: 900, guessed: false, flags: 0 } } } as TelemetryEvent);
joinedLeaderEngine.process(score('late-joiner-first', 70, 'LateJoiner', 900, 1800));
joinedLeaderEngine.process(score('joined-target-overtake', 21, 'Alpha', 100, 1401, true));
joinedLeaderEngine.process(score('joined-self-first', 21, 'Alpha', 1401, 1801, true));
assert(joinedLeaderEngine.getInstance('joined')?.status === 'completion-pending', 'A later-joined leader may be displaced after an original 1250+ target was already overtaken.');

const resetEngine = new ChallengeEngine({ autoPersist: false });
resetEngine.register(ultimateComebackDefinition);
resetEngine.activate({ instanceId: 'reset', challengeId: 'ultimate-comeback' });
resetEngine.process(hydration(players));
resetEngine.process(score('score-reset', 61, 'BaselineTarget', 1400, 0));
resetEngine.process(score('next-game-self', 21, 'Alpha', 0, 100, true));
assert(resetEngine.getInstance('reset')?.status === 'active', 'A score reset must invalidate the previous game baseline.');
assert((resetEngine.getInstance('reset')?.internalState as { invalidated?: boolean }).invalidated === true, 'The stale baseline must stay invalidated after a score reset.');

console.log('Time Waste and Ultimate Comeback v3 runtime test passed.');
