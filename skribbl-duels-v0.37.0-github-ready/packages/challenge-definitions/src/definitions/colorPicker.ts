import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type { TelemetryEventOf } from '@skribbl-duels/telemetry-contracts';
import { isPositiveInteger, localization } from '../shared';

export type SkribblColorFamily =
  | 'monochrome'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'magenta'
  | 'pink'
  | 'peach'
  | 'brown';

export interface ColorPickerParameters {
  families: number;
}

export interface ColorPickerState {
  currentRoundSessionId: string | null;
  ownDrawingActive: boolean;
  usedFamilies: SkribblColorFamily[];
  evidenceEventIdsByFamily: Partial<Record<SkribblColorFamily, string>>;
}

export const SKRIBBL_COLOR_IDS_BY_FAMILY: Readonly<Record<SkribblColorFamily, readonly number[]>> = {
  monochrome: [1, 2, 3],
  red: [4, 5],
  orange: [6, 7],
  yellow: [8, 9],
  green: [10, 11, 12],
  cyan: [13, 14, 15],
  blue: [16, 17],
  magenta: [18, 19],
  pink: [20, 21],
  peach: [22, 23],
  brown: [24, 25]
};

export function colorIdsForFamily(family: SkribblColorFamily): readonly number[] {
  return SKRIBBL_COLOR_IDS_BY_FAMILY[family];
}

export function colorFamilyForId(colorId: number): SkribblColorFamily | null {
  if (colorId >= 1 && colorId <= 3) return 'monochrome';
  if (colorId === 4 || colorId === 5) return 'red';
  if (colorId === 6 || colorId === 7) return 'orange';
  if (colorId === 8 || colorId === 9) return 'yellow';
  if (colorId >= 10 && colorId <= 12) return 'green';
  if (colorId >= 13 && colorId <= 15) return 'cyan';
  if (colorId === 16 || colorId === 17) return 'blue';
  if (colorId === 18 || colorId === 19) return 'magenta';
  if (colorId === 20 || colorId === 21) return 'pink';
  if (colorId === 22 || colorId === 23) return 'peach';
  if (colorId === 24 || colorId === 25) return 'brown';
  return null;
}

function submittedFamilies(event: TelemetryEventOf<'DRAW_COMMAND_BATCH_SUBMITTED'>): SkribblColorFamily[] {
  return Array.from(new Set(event.payload.commands.flatMap(command => {
    if (command.kind !== 'PENCIL' && command.kind !== 'FILL') return [];
    const family = colorFamilyForId(command.color);
    return family === null ? [] : [family];
  })));
}

export const colorPickerDefinition: ChallengeDefinition<ColorPickerState, ColorPickerParameters> = {
  id: 'color-picker',
  version: 1,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Color Picker',
      'Use at least 5 different color families during one of your drawings in a public lobby. White does not count.',
      'Color Picker',
      'Benutze während einer deiner Zeichnungen in einer öffentlichen Lobby mindestens 5 verschiedene Farbfamilien. Weiß zählt nicht.'
    ),
    icon: 'color-picker-palette',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: {
    families: 5
  },
  target: parameters => parameters.families,
  createInitialState: () => ({
    currentRoundSessionId: null,
    ownDrawingActive: false,
    usedFamilies: [],
    evidenceEventIdsByFamily: {}
  }),
  validateParameters(value): value is ColorPickerParameters {
    if (typeof value !== 'object' || value === null) return false;
    const families = (value as Partial<ColorPickerParameters>).families;
    return isPositiveInteger(families) && families <= 11;
  },
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
          usedFamilies: [],
          evidenceEventIdsByFamily: {}
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'color-picker-own-drawing-started'
          : 'color-picker-foreign-drawing-started'
      };
    }

    if (event.type !== 'DRAW_COMMAND_BATCH_SUBMITTED') return null;
    if (!runtime.internalState.ownDrawingActive) return null;
    if (event.context.roundSessionId === null ||
        event.context.roundSessionId !== runtime.internalState.currentRoundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    const observed = submittedFamilies(event);
    if (observed.length === 0) return null;

    const usedFamilies = [...runtime.internalState.usedFamilies];
    const evidenceEventIdsByFamily = {
      ...runtime.internalState.evidenceEventIdsByFamily
    };
    let changed = false;

    for (const family of observed) {
      if (usedFamilies.includes(family)) continue;
      usedFamilies.push(family);
      evidenceEventIdsByFamily[family] = event.eventId;
      changed = true;
    }

    if (!changed) return null;
    const evidenceEventIds = usedFamilies
      .map(family => evidenceEventIdsByFamily[family])
      .filter((id): id is string => typeof id === 'string');

    return {
      internalState: {
        ...runtime.internalState,
        usedFamilies,
        evidenceEventIdsByFamily
      },
      progress: usedFamilies.length,
      complete: usedFamilies.length >= parameters.families,
      reason: 'color-picker-new-color-family-used',
      evidenceEventIds
    };
  }
};
