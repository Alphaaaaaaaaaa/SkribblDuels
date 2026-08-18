import * as assert from 'node:assert/strict';
import { ChallengeEngine, type ChallengeEngineSnapshot } from '@skribbl-duels/challenge-engine';
import {
  bigWordDefinition,
  bloodlineDefinition,
  colorPickerDefinition,
  coolNumberDetectedDefinition,
  fanboyDefinition,
  hintReflexesDefinition,
  moggedDefinition,
  needSomeSpaceDefinition,
  ouchDefinition,
  picassoDefinition,
  setOfficialWordListForTesting,
  smolWordsDefinition,
  timeWasteDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent, TelemetryEventType } from '@skribbl-duels/telemetry-contracts';

interface EventOptions {
  actor?: { playerId: number; name: string; isSelf: boolean } | null;
  drawerId?: number | null;
  meId?: number | null;
  monotonicMs?: number;
  roundSessionId?: string | null;
}

let sequence = 0;
function event(
  type: TelemetryEventType,
  eventId: string,
  payload: Record<string, unknown>,
  options: EventOptions = {}
): TelemetryEvent {
  sequence += 1;
  const monotonicMs = options.monotonicMs ?? sequence * 100;
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: sequence,
    type,
    category: type.startsWith('DRAW_') || type.startsWith('VOTE_') ? 'drawing' : 'guessing',
    occurredAt: 1_800_000_000_000 + monotonicMs,
    monotonicMs,
    actor: options.actor ?? null,
    context: {
      lobbySessionId: 'rebalance-lobby',
      lobbyGeneration: 1,
      lobbyId: 'REBALANCE',
      lobbyType: 0,
      languageId: 1,
      languageName: 'German',
      gameSessionId: 'rebalance-game',
      roundSessionId: options.roundSessionId === undefined ? 'rebalance-round' : options.roundSessionId,
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: options.meId === undefined ? 21 : options.meId,
      drawerId: options.drawerId === undefined ? 17 : options.drawerId
    },
    source: {
      origin: 'decoded-packet',
      rawRecordId: `raw-${eventId}`,
      changeId: null,
      direction: 'server-to-client',
      socketEvent: 'data',
      packetId: 8
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEvent;
}

function engineFor(definition: Parameters<ChallengeEngine['register']>[0], instanceId: string): ChallengeEngine {
  const engine = new ChallengeEngine({ autoPersist: false, createId: () => `${instanceId}-candidate` });
  engine.register(definition);
  engine.activate({ instanceId, challengeId: definition.id });
  return engine;
}

const expectedVersions = new Map([
  [bloodlineDefinition.id, 3], [ouchDefinition.id, 2], [picassoDefinition.id, 2],
  [coolNumberDetectedDefinition.id, 2], [fanboyDefinition.id, 2], [colorPickerDefinition.id, 2],
  [timeWasteDefinition.id, 2], [moggedDefinition.id, 4], [needSomeSpaceDefinition.id, 2],
  [smolWordsDefinition.id, 2], [bigWordDefinition.id, 2], [hintReflexesDefinition.id, 2]
]);
for (const [definition, version] of [
  [bloodlineDefinition, 3], [ouchDefinition, 2], [picassoDefinition, 2],
  [coolNumberDetectedDefinition, 2], [fanboyDefinition, 2], [colorPickerDefinition, 2],
  [timeWasteDefinition, 2], [moggedDefinition, 4], [needSomeSpaceDefinition, 2],
  [smolWordsDefinition, 2], [bigWordDefinition, 2], [hintReflexesDefinition, 2]
] as const) {
  assert.equal(definition.version, version, `${definition.id} definition version drifted.`);
  assert.equal(expectedVersions.get(definition.id), version);
}

const bloodline = engineFor(bloodlineDefinition, 'bloodline');
bloodline.process(event('CREDITS_OPENED', 'credits-opened', {
  pathname: '/credits', readyState: 'complete', linkClickObserved: true,
  navigationId: 'nav-1', loadElapsedMs: 250
}, { roundSessionId: null, drawerId: null, meId: null }));
assert.equal(bloodline.getInstance('bloodline')?.status, 'completion-pending');
const persisted = bloodline.exportSnapshot();
const restored = new ChallengeEngine({
  autoPersist: false,
  persistence: {
    load: async (): Promise<ChallengeEngineSnapshot> => structuredClone(persisted),
    save: async () => undefined,
    clear: async () => undefined
  }
});
restored.register(bloodlineDefinition);
await restored.restore();
assert.equal(restored.getInstance('bloodline')?.status, 'completion-pending');
assert.deepEqual(restored.getInstance('bloodline')?.completionCandidate?.evidenceEventIds, ['credits-opened']);

const ouchLate = engineFor(ouchDefinition, 'ouch-late');
ouchLate.process(event('ROUND_STARTED', 'ouch-late-start', {}, { monotonicMs: 1_000 }));
ouchLate.process(event('FIRST_GUESS', 'ouch-late-first', { elapsedMs: 5_000 }, {
  monotonicMs: 6_000, actor: { playerId: 8, name: 'First', isSelf: false }
}));
ouchLate.process(event('CORRECT_GUESS', 'ouch-late-self', {
  elapsedMs: 5_201, position: 2, isFirstGuesser: false
}, { monotonicMs: 6_201, actor: { playerId: 21, name: 'Alpha', isSelf: true } }));
assert.equal(ouchLate.getInstance('ouch-late')?.status, 'active');
const ouchExact = engineFor(ouchDefinition, 'ouch-exact');
ouchExact.process(event('ROUND_STARTED', 'ouch-exact-start', {}, { monotonicMs: 1_000 }));
ouchExact.process(event('FIRST_GUESS', 'ouch-exact-first', { elapsedMs: 5_000 }, {
  monotonicMs: 6_000, actor: { playerId: 8, name: 'First', isSelf: false }
}));
ouchExact.process(event('CORRECT_GUESS', 'ouch-exact-self', {
  elapsedMs: 5_200, position: 2, isFirstGuesser: false
}, { monotonicMs: 6_200, actor: { playerId: 21, name: 'Alpha', isSelf: true } }));
assert.equal(ouchExact.getInstance('ouch-exact')?.status, 'completion-pending');

const picasso = engineFor(picassoDefinition, 'picasso');
picasso.process(event('ROUND_STARTED', 'picasso-start', {}, { drawerId: 21 }));
for (const playerId of [31, 32, 33]) {
  picasso.process(event('VOTE_RECEIVED', `picasso-like-${playerId}`, { playerId, vote: 1 }, {
    drawerId: 21, actor: { playerId, name: `Fan ${playerId}`, isSelf: false }
  }));
}
assert.equal(picasso.getInstance('picasso')?.status, 'active');
picasso.process(event('VOTE_RECEIVED', 'picasso-like-34', { playerId: 34, vote: 1 }, {
  drawerId: 21, actor: { playerId: 34, name: 'Fan 34', isSelf: false }
}));
assert.equal(picasso.getInstance('picasso')?.status, 'completion-pending');

const cool = engineFor(coolNumberDetectedDefinition, 'cool');
cool.process(event('SCORE_CHANGED', 'cool-250', { playerId: 31, totalScore: 250, previousTotalScore: 200 }));
assert.equal(cool.getInstance('cool')?.status, 'active');
cool.process(event('SCORE_CHANGED', 'cool-500', { playerId: 31, totalScore: 500, previousTotalScore: 450 }));
assert.equal(cool.getInstance('cool')?.status, 'completion-pending');

const color = engineFor(colorPickerDefinition, 'color');
color.process(event('ROUND_STARTED', 'color-start', {
  players: [{ id: 21, name: 'Alpha' }, { id: 31, name: 'Bravo' }, { id: 32, name: 'Charlie' }]
}, { drawerId: 21 }));
color.process(event('DRAW_COMMAND_BATCH_SUBMITTED', 'color-all-26', {
  commandCount: 26,
  tools: [0], colors: Array.from({ length: 26 }, (_, id) => id), brushSizes: [4],
  commands: Array.from({ length: 26 }, (_, id) => ({
    kind: 'PENCIL', tool: 0, color: id, brushSize: 4,
    startX: id, startY: id, endX: id + 1, endY: id + 1,
    raw: [0, id, 4, id, id, id + 1, id + 1]
  }))
}, { drawerId: 21 }));
for (const playerId of [31, 32]) {
  color.process(event('CORRECT_GUESS', `color-guessed-${playerId}`, {
    playerId, position: playerId - 30, elapsedMs: 10_000, isFirstGuesser: playerId === 31
  }, { drawerId: 21, actor: { playerId, name: `Player ${playerId}`, isSelf: false } }));
}
assert.equal(color.getInstance('color')?.status, 'active', 'Color Picker must wait for ROUND_ENDED.');
color.process(event('ROUND_ENDED', 'color-end', {}, { drawerId: 21 }));
assert.equal(color.getInstance('color')?.status, 'completion-pending');
assert.deepEqual((color.getInstance('color')?.internalState as { usedColorIds: number[] }).usedColorIds, Array.from({ length: 26 }, (_, id) => id));

setOfficialWordListForTesting(1, ['Apfel', 'Banane', 'Kirsche', 'Atlantis', 'Ski', 'Hai', 'Zoo', 'San Francisco Bay'], 'German');
const mogged = engineFor(moggedDefinition, 'mogged');
mogged.process(event('ROUND_STARTED', 'mogged-start', {}, { drawerId: 17 }));
for (const [playerId, word] of [[31, 'Apfel'], [32, 'Banane'], [33, 'Kirsche']] as const) {
  mogged.process(event('CHAT_MESSAGE_RECEIVED', `mogged-wrong-${playerId}`, { playerId, message: word }, {
    actor: { playerId, name: `Player ${playerId}`, isSelf: false }
  }));
}
mogged.process(event('CORRECT_GUESS', 'mogged-self-first', {
  playerId: 21, position: 1, isFirstGuesser: true, elapsedMs: 12_000
}, { actor: { playerId: 21, name: 'Alpha', isSelf: true } }));
assert.equal(mogged.getInstance('mogged')?.status, 'completion-pending');

const hintBlocked = engineFor(hintReflexesDefinition, 'hint-blocked');
hintBlocked.process(event('ROUND_STARTED', 'hint-blocked-start', {}, { monotonicMs: 1_000 }));
hintBlocked.process(event('CORRECT_GUESS', 'hint-foreign-before', {
  playerId: 31, position: 1, isFirstGuesser: true, elapsedMs: 5_000
}, { monotonicMs: 5_000, actor: { playerId: 31, name: 'Bravo', isSelf: false } }));
hintBlocked.process(event('HINT_REVEALED', 'hint-blocked-first-hint', { hints: [{ position: 0, character: 'A' }] }, { monotonicMs: 6_000 }));
hintBlocked.process(event('CORRECT_GUESS', 'hint-blocked-self', {
  playerId: 21, position: 2, isFirstGuesser: false, elapsedMs: 7_000
}, { monotonicMs: 7_000, actor: { playerId: 21, name: 'Alpha', isSelf: true } }));
assert.equal(hintBlocked.getInstance('hint-blocked')?.status, 'active');

const hintExact = engineFor(hintReflexesDefinition, 'hint-exact');
hintExact.process(event('ROUND_STARTED', 'hint-exact-start', {}, { monotonicMs: 1_000 }));
hintExact.process(event('HINT_REVEALED', 'hint-exact-first-hint', { hints: [{ position: 0, character: 'A' }] }, { monotonicMs: 6_000 }));
hintExact.process(event('CORRECT_GUESS', 'hint-exact-self', {
  playerId: 21, position: 1, isFirstGuesser: true, elapsedMs: 8_000
}, { monotonicMs: 8_000, actor: { playerId: 21, name: 'Alpha', isSelf: true } }));
assert.equal(hintExact.getInstance('hint-exact')?.status, 'completion-pending');

assert.equal(timeWasteDefinition.defaultParameters.seconds, 50);
assert.equal(fanboyDefinition.metadata.localization['en']!.description.includes('every eligible drawing'), true);
assert.equal(needSomeSpaceDefinition.metadata.localization['en']!.description.includes('derived from the active'), true);
assert.equal(smolWordsDefinition.metadata.localization['en']!.description.includes('derived from the active'), true);
assert.equal(bigWordDefinition.metadata.localization['en']!.description.includes('derived from the active'), true);

console.log('v0.49 challenge rebalance and Bloodline persistence runtime test passed.');
