import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { fanboyDefinition } from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function vote(id: string, roundSessionId: string, value = 1, selfDrawing = false): TelemetryEvent {
  return {
    schemaVersion: 1,
    eventId: id,
    telemetrySequence: 1,
    type: 'VOTE_SUBMITTED',
    category: 'drawing',
    occurredAt: Date.now(),
    monotonicMs: performance.now(),
    actor: { playerId: 21, name: 'Alpha', isSelf: true },
    context: {
      lobbySessionId: 'lobby-session',
      lobbyGeneration: 1,
      lobbyId: 'PUBLIC1',
      lobbyType: 0,
      languageId: 1,
      languageName: 'German',
      gameSessionId: 'game-session',
      roundSessionId,
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: 21,
      drawerId: selfDrawing ? 21 : 17
    },
    source: {
      origin: 'decoded-packet',
      rawRecordId: `raw-${id}`,
      changeId: null,
      direction: 'client-to-server',
      socketEvent: 'data',
      packetId: 8
    },
    payload: { vote: value, voteName: value === 1 ? 'LIKE' : 'DISLIKE' },
    confidence: 'confirmed',
    highVolume: false
  };
}

const engine = new ChallengeEngine({ autoPersist: false });
engine.register(fanboyDefinition);
engine.activate({ instanceId: 'fanboy-test', challengeId: 'fanboy' });
engine.process(vote('like-a', 'turn-a'));
engine.process(vote('like-a-duplicate', 'turn-a'));
engine.process(vote('dislike-b', 'turn-b', 0));
engine.process(vote('self-like', 'turn-self', 1, true));
assert(engine.getInstance('fanboy-test')?.progress.current === 1, 'Only the first valid turn should count.');
engine.process(vote('like-b', 'turn-b'));
engine.process(vote('like-c', 'turn-c'));
const runtime = engine.getInstance('fanboy-test');
assert(runtime?.status === 'completion-pending', 'Fanboy should complete after three distinct liked turns.');
assert(runtime.progress.current === 3, 'Fanboy progress should be 3/3.');
assert(runtime.completionCandidate?.evidenceEventIds.join(',') === 'like-a,like-b,like-c', 'Evidence should contain only the three valid likes.');
console.log('Fanboy runtime test passed.');
