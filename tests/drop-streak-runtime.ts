import * as assert from 'node:assert/strict';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import { dropStreakDefinition } from '@skribbl-duels/challenge-definitions';
import {
  normalizeTypoDropBoundaryDetail,
  TYPO_DROP_CLAIMED_EVENT_NAME,
  TYPO_DROP_MISSED_EVENT_NAME,
  TYPO_DROP_SPAWNED_EVENT_NAME,
  TypoDropTelemetryAdapter
} from '@skribbl-duels/telemetry-core';
import type {
  TelemetryEventOf,
  TelemetryEventType
} from '@skribbl-duels/telemetry-contracts';

let sequence = 0;

function eventBase<T extends TelemetryEventType>(type: T, eventId: string) {
  sequence += 1;
  return {
    schemaVersion: 1 as const,
    eventId,
    telemetrySequence: sequence,
    type,
    category: 'system' as const,
    occurredAt: 1_700_000_000_000 + sequence,
    monotonicMs: sequence,
    actor: { playerId: 21, name: 'Alpha', isSelf: true },
    context: {
      lobbySessionId: 'drop-streak-lobby-session',
      lobbyGeneration: 1,
      lobbyId: 'DROPSTREAK',
      lobbyType: 0,
      languageId: 0,
      languageName: 'English',
      gameSessionId: 'drop-streak-game',
      roundSessionId: 'drop-streak-round',
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: 21,
      drawerId: 77
    },
    source: {
      origin: 'dom-adapter' as const,
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    confidence: 'confirmed' as const,
    highVolume: false
  };
}

function spawned(id: string): TelemetryEventOf<'TYPO_DROP_SPAWNED'> {
  return {
    ...eventBase('TYPO_DROP_SPAWNED', `spawn-${id}-${sequence}`),
    payload: { dropObservationId: id, dropId: id, method: 'typo-relay' }
  };
}

function claimed(id: string | null, suffix = ''): TelemetryEventOf<'TYPO_DROP_CLAIMED'> {
  return {
    ...eventBase('TYPO_DROP_CLAIMED', `claim-${id ?? 'none'}-${suffix}-${sequence}`),
    payload: {
      own: true,
      dropId: id,
      dropObservationId: id,
      catchTimeMs: 400,
      firstClaim: true,
      clearedDrop: false,
      leagueMode: false,
      leagueWeight: null,
      username: 'Alpha',
      method: 'typo-relay'
    }
  };
}

function missed(id: string): TelemetryEventOf<'TYPO_DROP_MISSED'> {
  return {
    ...eventBase('TYPO_DROP_MISSED', `miss-${id}-${sequence}`),
    payload: {
      dropObservationId: id,
      dropId: id,
      reason: 'cleared-or-expired',
      method: 'typo-relay'
    }
  };
}

function createEngine(instanceId: string): ChallengeEngine {
  const engine = new ChallengeEngine({ autoPersist: false });
  engine.register(dropStreakDefinition);
  engine.activate({ instanceId, challengeId: 'drop-streak' });
  return engine;
}

function catchDrop(engine: ChallengeEngine, id: string): void {
  engine.process(spawned(id));
  engine.process(claimed(id));
}

assert.deepEqual(normalizeTypoDropBoundaryDetail({ drop: { dropID: 123 } }), {
  dropId: 123,
  reason: null
});

const engine = createEngine('streak');
engine.process(claimed(null, 'uncorrelated'));
assert.equal(engine.getInstance('streak')?.progress.current, 0, 'A claim without a correlated spawn cannot count.');

catchDrop(engine, 'one');
catchDrop(engine, 'two');
assert.equal(engine.getInstance('streak')?.progress.current, 2);
engine.process(claimed('two', 'duplicate'));
assert.equal(engine.getInstance('streak')?.progress.current, 2, 'A second claim for one resolved spawn cannot count twice.');
engine.process(spawned('missed'));
engine.process(missed('missed'));
assert.equal(engine.getInstance('streak')?.progress.current, 0, 'An explicitly missed drop must reset the streak.');

for (const id of ['three', 'four', 'five', 'six', 'seven']) catchDrop(engine, id);
const completed = engine.getInstance('streak');
assert.equal(completed?.status, 'completion-pending');
assert.equal(completed?.progress.current, 5);
assert.equal(completed?.completionCandidate?.evidenceEventIds.length, 10, 'Five spawn/claim pairs form the completion evidence.');

const replaced = createEngine('replaced');
catchDrop(replaced, 'a');
replaced.process(spawned('b'));
replaced.process(spawned('c'));
assert.equal(replaced.getInstance('replaced')?.progress.current, 0, 'A new spawn before the prior drop resolves must fail closed.');
replaced.process(claimed('b'));
assert.equal(replaced.getInstance('replaced')?.progress.current, 0, 'An out-of-order claim must not revive the streak.');

const originalWindow = globalThis.window;
const windowTarget = new EventTarget();
Object.defineProperty(globalThis, 'window', { configurable: true, value: windowTarget });
const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
const adapter = new TypoDropTelemetryAdapter({
  emitDomEvent(type: string, payload: Record<string, unknown>) {
    emitted.push({ type, payload });
  }
} as never, { missGraceMs: 1 });

try {
  adapter.start();
  windowTarget.dispatchEvent(new CustomEvent(TYPO_DROP_SPAWNED_EVENT_NAME, {
    detail: { dropId: 'relay-1' }
  }));
  windowTarget.dispatchEvent(new CustomEvent(TYPO_DROP_CLAIMED_EVENT_NAME, {
    detail: {
      ownClaim: true,
      claim: {
        dropId: 'relay-1',
        catchTimeMs: 321,
        firstClaim: true,
        clearedDrop: false,
        leagueMode: false,
        leagueWeight: null,
        username: 'Alpha'
      }
    }
  }));
  windowTarget.dispatchEvent(new CustomEvent(TYPO_DROP_SPAWNED_EVENT_NAME, {
    detail: { dropId: 'relay-2' }
  }));
  windowTarget.dispatchEvent(new CustomEvent(TYPO_DROP_MISSED_EVENT_NAME, {
    detail: { dropId: 'relay-2', reason: 'cleared-or-expired' }
  }));
} finally {
  adapter.stop();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
}

assert.deepEqual(emitted.map(entry => entry.type), [
  'TYPO_DROP_SPAWNED',
  'TYPO_DROP_CLAIMED',
  'TYPO_DROP_SPAWNED',
  'TYPO_DROP_MISSED'
]);
const firstObservation = emitted[0]?.payload.dropObservationId;
assert.equal(emitted[1]?.payload.dropObservationId, firstObservation, 'The adapter must correlate a confirmed claim to its spawn.');
assert.notEqual(emitted[2]?.payload.dropObservationId, firstObservation, 'Each spawned drop needs a unique observation ID.');

console.log('Drop Streak correlation, reset and Typo relay lifecycle tests passed.');
