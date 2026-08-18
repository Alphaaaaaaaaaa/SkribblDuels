import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { fanboyDefinition } from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function event(
  type: TelemetryEvent['type'],
  id: string,
  roundSessionId: string | null,
  drawerId: number | null,
  payload: Record<string, unknown>,
  actor: TelemetryEvent['actor'] = null
): TelemetryEvent {
  return {
    schemaVersion: 1,
    eventId: id,
    telemetrySequence: 1,
    type,
    category: type === 'VOTE_SUBMITTED' ? 'drawing' : 'round',
    occurredAt: Date.now(),
    monotonicMs: performance.now(),
    actor,
    context: {
      lobbySessionId: 'lobby-session', lobbyGeneration: 1, lobbyId: 'PUBLIC1', lobbyType: 0,
      languageId: 1, languageName: 'German', gameSessionId: 'game-session', roundSessionId,
      roundIndex: 0, roundNumber: 1, maxRounds: 3, gameStateId: 4,
      gameStateName: 'DRAWING', meId: 21, drawerId
    },
    source: {
      origin: 'decoded-packet', rawRecordId: `raw-${id}`, changeId: null,
      direction: type === 'VOTE_SUBMITTED' ? 'client-to-server' : 'server-to-client',
      socketEvent: 'data', packetId: 8
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEvent;
}

const lifecyclePayload = {
  previousStateId: 0, stateId: 1, stateName: 'GAME_STARTING', time: 5,
  roundIndex: 0, roundNumber: 1, maxRounds: 3
};
const self = { playerId: 21, name: 'Alpha', isSelf: true } as const;
const engine = new ChallengeEngine({ autoPersist: false });
engine.register(fanboyDefinition);
engine.activate({ instanceId: 'fanboy-test', challengeId: 'fanboy' });
engine.process(event('GAME_STARTING', 'game-start', null, null, lifecyclePayload));
engine.process(event('ROUND_STARTED', 'turn-a-start', 'turn-a', 17, { ...lifecyclePayload, drawerId: 17 }));
engine.process(event('VOTE_SUBMITTED', 'like-a', 'turn-a', 17, { vote: 1 }, self));
engine.process(event('VOTE_SUBMITTED', 'like-a-duplicate', 'turn-a', 17, { vote: 1 }, self));
engine.process(event('ROUND_ENDED', 'turn-a-end', 'turn-a', 17, lifecyclePayload));
engine.process(event('ROUND_STARTED', 'turn-self-start', 'turn-self', 21, { ...lifecyclePayload, drawerId: 21 }));
engine.process(event('ROUND_ENDED', 'turn-self-end', 'turn-self', 21, lifecyclePayload));
engine.process(event('ROUND_STARTED', 'turn-b-start', 'turn-b', 18, { ...lifecyclePayload, drawerId: 18 }));
engine.process(event('VOTE_SUBMITTED', 'like-b', 'turn-b', 18, { vote: 1 }, self));
engine.process(event('ROUND_ENDED', 'turn-b-end', 'turn-b', 18, lifecyclePayload));
assert(engine.getInstance('fanboy-test')?.status === 'active', 'Fanboy must wait for GAME_ENDED.');
engine.process(event('GAME_ENDED', 'game-end', null, null, lifecyclePayload));
const runtime = engine.getInstance('fanboy-test');
assert(runtime?.status === 'completion-pending', 'Liking every foreign drawing in the observed round should complete Fanboy.');
assert(runtime.progress.current === 3 && runtime.progress.target === 3, 'Two liked drawings plus the game-end boundary should be 3/3.');
assert(runtime.completionCandidate?.evidenceEventIds.includes('like-a-duplicate'), 'The latest confirmed like for the first drawing must be evidence.');
assert(runtime.completionCandidate?.evidenceEventIds.includes('like-b'), 'Second like must be evidence.');
assert(runtime.completionCandidate?.evidenceEventIds.includes('game-end'), 'GAME_ENDED must be evidence.');

const missed = new ChallengeEngine({ autoPersist: false });
missed.register(fanboyDefinition);
missed.activate({ instanceId: 'fanboy-missed', challengeId: 'fanboy' });
missed.process(event('GAME_STARTING', 'missed-game-start', null, null, lifecyclePayload));
missed.process(event('ROUND_STARTED', 'missed-turn-start', 'missed-turn', 17, { ...lifecyclePayload, drawerId: 17 }));
missed.process(event('ROUND_ENDED', 'missed-turn-end', 'missed-turn', 17, lifecyclePayload));
missed.process(event('GAME_ENDED', 'missed-game-end', null, null, lifecyclePayload));
assert(missed.getInstance('fanboy-missed')?.status === 'active', 'A complete game with an unliked drawing must not complete Fanboy.');

console.log('Fanboy complete-round runtime test passed.');
