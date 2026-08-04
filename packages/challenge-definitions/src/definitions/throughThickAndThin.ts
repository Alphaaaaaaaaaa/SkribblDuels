import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type { TelemetryEventOf } from '@skribbl-duels/telemetry-contracts';
import { localization } from '../shared';

export interface ThroughThickAndThinParameters {
  brushSizes: number[];
}

export interface ThroughThickAndThinState {
  currentRoundSessionId: string | null;
  ownDrawingActive: boolean;
  usedBrushSizes: number[];
  evidenceEventIdsByBrushSize: Record<string, string>;
}

function normalizeRequiredBrushSizes(values: readonly number[]): number[] {
  return Array.from(new Set(values.filter(value => Number.isFinite(value))))
    .sort((a, b) => a - b);
}

function validParameters(value: unknown): value is ThroughThickAndThinParameters {
  if (typeof value !== 'object' || value === null) return false;
  const brushSizes = (value as Partial<ThroughThickAndThinParameters>).brushSizes;
  if (!Array.isArray(brushSizes) || brushSizes.length === 0) return false;
  return brushSizes.every(size => typeof size === 'number' && Number.isFinite(size) && size > 0);
}

function submittedBrushSizes(event: TelemetryEventOf<'DRAW_COMMAND_BATCH_SUBMITTED'>): number[] {
  return Array.from(new Set(event.payload.commands.flatMap(command =>
    command.kind === 'PENCIL' ? [command.brushSize] : []
  )));
}

export const throughThickAndThinDefinition: ChallengeDefinition<
  ThroughThickAndThinState,
  ThroughThickAndThinParameters
> = {
  id: 'through-thick-and-thin',
  version: 1,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Through Thick and Thin',
      'Use every brush size at least once during one of your drawings in a public lobby.',
      'Through Thick and Thin',
      'Benutze während einer deiner Zeichnungen in einer öffentlichen Lobby jede Pinselgröße mindestens einmal.'
    ),
    icon: 'through-thick-and-thin-brushes',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: {
    brushSizes: [4, 10, 20, 32, 40]
  },
  target: parameters => normalizeRequiredBrushSizes(parameters.brushSizes).length,
  createInitialState: () => ({
    currentRoundSessionId: null,
    ownDrawingActive: false,
    usedBrushSizes: [],
    evidenceEventIdsByBrushSize: {}
  }),
  validateParameters: validParameters,
  relevantEvents: ['ROUND_STARTED', 'DRAW_COMMAND_BATCH_SUBMITTED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      const ownDrawingActive = event.context.meId !== null && event.context.drawerId === event.context.meId;

      return {
        internalState: {
          currentRoundSessionId: roundSessionId,
          ownDrawingActive,
          usedBrushSizes: [],
          evidenceEventIdsByBrushSize: {}
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'through-thick-and-thin-own-drawing-started'
          : 'through-thick-and-thin-foreign-drawing-started'
      };
    }

    if (event.type !== 'DRAW_COMMAND_BATCH_SUBMITTED') return null;
    if (!runtime.internalState.ownDrawingActive) return null;
    if (event.context.roundSessionId === null ||
        event.context.roundSessionId !== runtime.internalState.currentRoundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    const required = normalizeRequiredBrushSizes(parameters.brushSizes);
    const observed = submittedBrushSizes(event).filter(size => required.includes(size));
    if (observed.length === 0) return null;

    const usedBrushSizes = [...runtime.internalState.usedBrushSizes];
    const evidenceEventIdsByBrushSize = {
      ...runtime.internalState.evidenceEventIdsByBrushSize
    };
    let changed = false;

    for (const size of observed) {
      if (usedBrushSizes.includes(size)) continue;
      usedBrushSizes.push(size);
      evidenceEventIdsByBrushSize[String(size)] = event.eventId;
      changed = true;
    }

    if (!changed) return null;
    usedBrushSizes.sort((a, b) => a - b);
    const progress = required.filter(size => usedBrushSizes.includes(size)).length;
    const evidenceEventIds = required
      .map(size => evidenceEventIdsByBrushSize[String(size)])
      .filter((id): id is string => typeof id === 'string');

    return {
      internalState: {
        ...runtime.internalState,
        usedBrushSizes,
        evidenceEventIdsByBrushSize
      },
      progress,
      complete: progress >= required.length,
      reason: 'through-thick-and-thin-new-brush-size-used',
      evidenceEventIds
    };
  }
};
