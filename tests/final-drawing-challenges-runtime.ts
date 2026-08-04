import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  madeYouSquintDefinition,
  monochromismDefinition,
  oneLineDefinition
} from '@skribbl-duels/challenge-definitions';
import type {
  TelemetryEvent,
  TelemetryEventType,
  TelemetryPayloadMap
} from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let sequence = 0;
function event<TType extends TelemetryEventType>(
  type: TType,
  payload: TelemetryPayloadMap[TType],
  options: {
    id?: string;
    drawerId?: number;
    actorId?: number | null;
    actorName?: string;
    roundSessionId?: string;
  } = {}
): TelemetryEvent {
  sequence += 1;
  const actorId = options.actorId === undefined ? null : options.actorId;
  return {
    schemaVersion: 1,
    eventId: options.id ?? `final-drawing-${sequence}`,
    telemetrySequence: sequence,
    type,
    category: type === 'CORRECT_GUESS' ? 'guessing' : type === 'ROUND_STARTED' ? 'round' : 'drawing',
    occurredAt: sequence * 100,
    monotonicMs: sequence * 100,
    actor: actorId === null ? null : {
      playerId: actorId,
      name: options.actorName ?? `Player ${actorId}`,
      isSelf: actorId === 1
    },
    context: {
      lobbySessionId: 'lobby',
      lobbyGeneration: 1,
      lobbyId: 'PUBLIC',
      lobbyType: 0,
      languageId: 1,
      languageName: 'German',
      gameSessionId: 'game',
      roundSessionId: options.roundSessionId ?? 'drawing-final-turn',
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: 1,
      drawerId: options.drawerId ?? 1
    },
    source: {
      origin: 'dom-adapter',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload,
    confidence: 'confirmed',
    highVolume: type === 'DRAW_COMMAND_BATCH_SUBMITTED'
  } as TelemetryEvent;
}

const players = [
  { id: 1, name: 'Alpha', avatar: [0, 1, 2, -1], score: 0, guessed: false, flags: 0 },
  { id: 2, name: 'Two', avatar: [1, 1, 2, -1], score: 0, guessed: false, flags: 0 },
  { id: 3, name: 'Three', avatar: [2, 1, 2, -1], score: 0, guessed: false, flags: 0 },
  { id: 4, name: 'Four', avatar: [3, 1, 2, -1], score: 0, guessed: false, flags: 0 }
];

function roundStart(roundSessionId = 'drawing-final-turn'): TelemetryEvent {
  return event('ROUND_STARTED', {
    previousStateId: 3,
    stateId: 4,
    stateName: 'DRAWING',
    time: 80,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    drawerId: 1,
    word: 'Haus',
    wordLengths: null,
    initialTime: 80,
    players
  }, { id: `${roundSessionId}-start`, actorId: 1, roundSessionId });
}

function pencil(color: number, id: string, roundSessionId = 'drawing-final-turn'): TelemetryEvent {
  return event('DRAW_COMMAND_BATCH_SUBMITTED', {
    commandCount: 1,
    tools: [0],
    colors: [color],
    brushSizes: [10],
    commands: [{
      kind: 'PENCIL', tool: 0, color, brushSize: 10,
      startX: 10, startY: 10, endX: 50, endY: 50,
      raw: [0, color, 10, 10, 10, 50, 50]
    }]
  }, { id, actorId: 1, roundSessionId });
}

function correct(playerId: number, id: string, roundSessionId = 'drawing-final-turn'): TelemetryEvent {
  return event('CORRECT_GUESS', {
    playerId,
    position: playerId - 1,
    elapsedMs: 5000 + playerId,
    estimatedTimeAtGuess: 70,
    serverTimeAnchorAtGuess: 80,
    includesWord: false,
    word: null,
    wrongGuessesBeforeCorrect: 0,
    isFirstGuesser: playerId === 2
  }, { id, actorId: playerId, roundSessionId });
}

function metrics(playerId: number, ratio: number, id: string, roundSessionId: string): TelemetryEvent {
  const totalPixels = 480000;
  const whitePixels = Math.round(totalPixels * ratio);
  return event('CANVAS_METRICS', {
    width: 800,
    height: 600,
    totalPixels,
    whitePixels,
    nonWhitePixels: totalPixels - whitePixels,
    whiteRatio: ratio,
    validStrokeCount: 1,
    trigger: 'correct-guess-snapshot',
    triggerEventId: `${id}-guess`,
    sampledPlayerId: playerId
  }, { id, actorId: playerId, roundSessionId });
}

const oneLine = new ChallengeEngine({ autoPersist: false });
oneLine.register(oneLineDefinition);
oneLine.activate({ instanceId: 'one-line', challengeId: 'one-line' });
oneLine.process(roundStart('one-line-turn'));
oneLine.process(event('STROKE_STARTED', {
  strokeId: 'stroke-1', x: 10, y: 10
}, { id: 'stroke-1-start', actorId: 1, roundSessionId: 'one-line-turn' }));
oneLine.process(pencil(4, 'one-line-pencil', 'one-line-turn'));
oneLine.process(event('STROKE_ENDED', {
  strokeId: 'stroke-1', commandCount: 1, validStrokeNumber: 1,
  colorIds: [4], brushSizes: [10], durationMs: 150
}, { id: 'stroke-1-end', actorId: 1, roundSessionId: 'one-line-turn' }));
oneLine.process(correct(2, 'one-line-guess-2', 'one-line-turn'));
assert(oneLine.getInstance('one-line')?.status === 'active', 'One Line must wait for every eligible player.');
oneLine.process(correct(3, 'one-line-guess-3', 'one-line-turn'));
oneLine.process(correct(4, 'one-line-guess-4', 'one-line-turn'));
assert(oneLine.getInstance('one-line')?.status === 'completion-pending', 'One stroke plus all start-of-turn guessers should complete One Line.');

const twoLines = new ChallengeEngine({ autoPersist: false });
twoLines.register(oneLineDefinition);
twoLines.activate({ instanceId: 'two-lines', challengeId: 'one-line' });
twoLines.process(roundStart('two-line-turn'));
twoLines.process(event('STROKE_STARTED', { strokeId: 'a', x: 0, y: 0 }, { id: 'a-start', actorId: 1, roundSessionId: 'two-line-turn' }));
twoLines.process(event('STROKE_STARTED', { strokeId: 'b', x: 1, y: 1 }, { id: 'b-start', actorId: 1, roundSessionId: 'two-line-turn' }));
for (const playerId of [2, 3, 4]) twoLines.process(correct(playerId, `two-lines-guess-${playerId}`, 'two-line-turn'));
assert(twoLines.getInstance('two-lines')?.status === 'active', 'A second stroke must disqualify One Line.');

const monoIncompletePalette = new ChallengeEngine({ autoPersist: false });
monoIncompletePalette.register(monochromismDefinition);
monoIncompletePalette.activate({ instanceId: 'mono-incomplete', challengeId: 'monochromism' });
monoIncompletePalette.process(roundStart('mono-incomplete-turn'));
monoIncompletePalette.process(pencil(4, 'mono-red-only', 'mono-incomplete-turn'));
for (const playerId of [2, 3, 4]) monoIncompletePalette.process(correct(playerId, `mono-incomplete-guess-${playerId}`, 'mono-incomplete-turn'));
assert(monoIncompletePalette.getInstance('mono-incomplete')?.status === 'active', 'Using only Red must not complete the Red family; Dark Red is also required.');

const monochrome = new ChallengeEngine({ autoPersist: false });
monochrome.register(monochromismDefinition);
monochrome.activate({ instanceId: 'mono', challengeId: 'monochromism' });
monochrome.process(roundStart('mono-turn'));
monochrome.process(pencil(4, 'mono-red', 'mono-turn'));
monochrome.process(pencil(5, 'mono-dark-red', 'mono-turn'));
monochrome.process(correct(2, 'mono-guess-2', 'mono-turn'));
monochrome.process(correct(3, 'mono-guess-3', 'mono-turn'));
assert(monochrome.getInstance('mono')?.status === 'active', 'Monochromism must wait for every eligible player.');
monochrome.process(correct(4, 'mono-guess-4', 'mono-turn'));
assert(monochrome.getInstance('mono')?.status === 'completion-pending', 'Every color in one family plus all guessers should complete Monochromism.');

const multiColor = new ChallengeEngine({ autoPersist: false });
multiColor.register(monochromismDefinition);
multiColor.activate({ instanceId: 'multi-color', challengeId: 'monochromism' });
multiColor.process(roundStart('multi-color-turn'));
multiColor.process(pencil(4, 'multi-red', 'multi-color-turn'));
multiColor.process(pencil(5, 'multi-dark-red', 'multi-color-turn'));
multiColor.process(pencil(16, 'multi-blue', 'multi-color-turn'));
for (const playerId of [2, 3, 4]) multiColor.process(correct(playerId, `multi-guess-${playerId}`, 'multi-color-turn'));
assert(multiColor.getInstance('multi-color')?.status === 'active', 'A second color family must disqualify Monochromism.');

const squint = new ChallengeEngine({ autoPersist: false });
squint.register(madeYouSquintDefinition);
squint.activate({ instanceId: 'squint', challengeId: 'made-you-squint' });
squint.process(roundStart('squint-turn'));
squint.process(metrics(2, 0.995, 'squint-metric-2', 'squint-turn'));
squint.process(metrics(3, 0.99, 'squint-metric-3', 'squint-turn'));
assert(squint.getInstance('squint')?.status === 'active', 'Made you squint must wait for every eligible player.');
squint.process(metrics(4, 0.999, 'squint-metric-4', 'squint-turn'));
assert(squint.getInstance('squint')?.status === 'completion-pending', 'All guessers at or above 99% white should complete Made you squint.');

const belowThreshold = new ChallengeEngine({ autoPersist: false });
belowThreshold.register(madeYouSquintDefinition);
belowThreshold.activate({ instanceId: 'below', challengeId: 'made-you-squint' });
belowThreshold.process(roundStart('below-turn'));
belowThreshold.process(metrics(2, 0.9899, 'below-metric-2', 'below-turn'));
belowThreshold.process(metrics(3, 1, 'below-metric-3', 'below-turn'));
belowThreshold.process(metrics(4, 1, 'below-metric-4', 'below-turn'));
assert(belowThreshold.getInstance('below')?.status === 'active', 'A single guess below 99% must prevent Made you squint in that turn.');

console.log('Final drawing challenge runtime test passed.');
