import * as assert from 'node:assert/strict';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { starterChallengeDefinitions, transcendedDefinition } from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent, TelemetryEventType } from '@skribbl-duels/telemetry-contracts';

let sequence = 0;
function event(type: TelemetryEventType, eventId: string, payload: Record<string, unknown>): TelemetryEvent {
  sequence += 1;
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: sequence,
    type,
    category: type === 'SCORE_CHANGED' ? 'score' : 'lobby',
    occurredAt: 1_800_000_000_000 + sequence * 100,
    monotonicMs: sequence * 100,
    actor: null,
    context: {
      lobbySessionId: 'transcended-lobby',
      lobbyGeneration: 1,
      lobbyId: 'PUBLIC',
      lobbyType: 0,
      languageId: 1,
      languageName: 'German',
      gameSessionId: 'transcended-game',
      roundSessionId: 'transcended-round',
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: 21,
      drawerId: 31
    },
    source: {
      origin: 'decoded-packet',
      rawRecordId: `raw-${eventId}`,
      changeId: null,
      direction: 'server-to-client',
      socketEvent: 'data',
      packetId: 10
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEvent;
}

assert.equal(starterChallengeDefinitions.length, 53, 'The live pool must expand whenever new Challenges are introduced.');
assert.equal(starterChallengeDefinitions.some(definition => definition.id === 'transcended'), true, 'Transcended must expand the Casual live draft pool.');
assert.equal(transcendedDefinition.metadata.rankedEligible, true, 'User-confirmed live certification enables Ranked drafting.');

const engine = new ChallengeEngine({ autoPersist: false, createId: () => 'transcended-candidate' });
engine.register(transcendedDefinition);
engine.activate({ instanceId: 'transcended', challengeId: transcendedDefinition.id });
engine.process(event('LOBBY_HYDRATED', 'hydrated', {
  lobbyId: 'PUBLIC',
  playerCount: 3,
  stateName: 'DRAWING',
  lobbyGeneration: 1,
  languageId: 1,
  languageName: 'German',
  meId: 21,
  ownerId: 31,
  roundIndex: 0,
  roundNumber: 1,
  players: [
    { id: 21, name: 'Alpha', score: 1_000 },
    { id: 31, name: 'Bravo', score: 900 },
    { id: 32, name: 'Charlie', score: 800 }
  ]
}));
engine.process(event('SCORE_CHANGED', 'lead-1900', {
  playerId: 21,
  previousTotalScore: 1_000,
  totalScore: 2_800
}));
assert.equal(engine.getInstance('transcended')?.status, 'active');
assert.equal(engine.getInstance('transcended')?.progress.current, 1_900);
engine.process(event('SCORE_CHANGED', 'lead-2100', {
  playerId: 21,
  previousTotalScore: 2_800,
  totalScore: 3_000
}));
assert.equal(engine.getInstance('transcended')?.status, 'completion-pending');

const solo = new ChallengeEngine({ autoPersist: false, createId: () => 'solo-candidate' });
solo.register(transcendedDefinition);
solo.activate({ instanceId: 'solo', challengeId: transcendedDefinition.id });
solo.process(event('LOBBY_HYDRATED', 'solo-hydrated', {
  lobbyId: 'PUBLIC',
  playerCount: 1,
  stateName: 'DRAWING',
  lobbyGeneration: 1,
  languageId: 1,
  languageName: 'German',
  meId: 21,
  ownerId: 21,
  roundIndex: 0,
  roundNumber: 1,
  players: [{ id: 21, name: 'Alpha', score: 9_000 }]
}));
assert.equal(solo.getInstance('solo')?.status, 'active', 'A lead requires at least one active opponent.');

console.log('Transcended certified Casual/Ranked pool runtime test passed.');
