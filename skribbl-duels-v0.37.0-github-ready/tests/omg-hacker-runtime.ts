import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { omgHackerDefinition } from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

let sequence = 0;
const baseContext = {
  lobbySessionId: 'lobby-session',
  lobbyGeneration: 1,
  lobbyId: 'PUBLIC',
  lobbyType: 0,
  languageId: 1,
  languageName: 'German',
  gameSessionId: 'game-session',
  roundSessionId: null,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  gameStateId: 4,
  gameStateName: 'DRAWING',
  meId: 21,
  drawerId: 30
};

function event(type: TelemetryEvent['type'], id: string, turn: string, self: boolean | null): TelemetryEvent {
  sequence += 1;
  const context = { ...baseContext, roundSessionId: turn };
  if (type === 'ROUND_STARTED') {
    return {
      schemaVersion: 1, eventId: id, telemetrySequence: sequence, type, category: 'round',
      occurredAt: sequence, monotonicMs: sequence, actor: null, context,
      source: { origin: 'system', rawRecordId: null, changeId: null, direction: null, socketEvent: null, packetId: null },
      payload: { previousStateId: 3, stateId: 4, stateName: 'DRAWING', time: 80, roundIndex: 0, roundNumber: 1, maxRounds: 3, drawerId: context.drawerId, word: null, wordLengths: [5], initialTime: 80 },
      confidence: 'confirmed', highVolume: false
    } as TelemetryEvent;
  }
  if (type === 'FIRST_GUESS') {
    return {
      schemaVersion: 1, eventId: id, telemetrySequence: sequence, type, category: 'guessing',
      occurredAt: sequence, monotonicMs: sequence,
      actor: self ? { playerId: 21, name: 'Alpha', isSelf: true } : { playerId: 22, name: 'Other', isSelf: false },
      context,
      source: { origin: 'system', rawRecordId: null, changeId: null, direction: null, socketEvent: null, packetId: null },
      payload: { playerId: self ? 21 : 22, position: 1, elapsedMs: 5000, estimatedTimeAtGuess: 75, serverTimeAnchorAtGuess: 80, includesWord: self, word: self ? 'Word' : null, wrongGuessesBeforeCorrect: self ? 2 : 0, isFirstGuesser: true },
      confidence: 'confirmed', highVolume: false
    } as TelemetryEvent;
  }
  throw new Error('Unsupported event');
}

const engine = new ChallengeEngine({ autoPersist: false, now: () => sequence });
engine.register(omgHackerDefinition);
engine.activate({ instanceId: 'field', challengeId: 'omg-hacker' });

function first(turn: number, self: boolean): void {
  engine.process(event('ROUND_STARTED', `start-${turn}`, `turn-${turn}`, null));
  engine.process(event('FIRST_GUESS', `first-${turn}`, `turn-${turn}`, self));
}

first(1, true);
first(2, true);
assertEqual(engine.getInstance('field')?.progress.current, 2, 'two self first guesses');
first(3, false);
assertEqual(engine.getInstance('field')?.progress.current, 0, 'other first guess resets streak');
for (let turn = 4; turn <= 8; turn += 1) first(turn, true);
assertEqual(engine.getInstance('field')?.status, 'completion-pending', 'five consecutive self first guesses complete');
assertEqual(engine.getInstance('field')?.progress.current, 5, 'final progress');
console.log('OMG Hacker runtime test passed.');
