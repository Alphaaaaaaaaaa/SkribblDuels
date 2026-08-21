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

export const SKRIBBL_COLOR_IDS_BY_FAMILY: Readonly<Record<SkribblColorFamily, readonly number[]>> = {
  monochrome: [1, 2, 3], red: [4, 5], orange: [6, 7], yellow: [8, 9],
  green: [10, 11, 12], cyan: [13, 14, 15], blue: [16, 17],
  magenta: [18, 19], pink: [20, 21], peach: [22, 23], brown: [24, 25]
};

export function colorIdsForFamily(family: SkribblColorFamily): readonly number[] {
  return SKRIBBL_COLOR_IDS_BY_FAMILY[family];
}

export function colorFamilyForId(colorId: number): SkribblColorFamily | null {
  return (Object.entries(SKRIBBL_COLOR_IDS_BY_FAMILY) as Array<[SkribblColorFamily, readonly number[]]>)
    .find(([, colorIds]) => colorIds.includes(colorId))?.[0] ?? null;
}

export interface ColorPickerParameters {
  colors: number;
}

export interface ColorPickerState {
  currentRoundSessionId: string | null;
  roundStartedEventId: string | null;
  ownDrawingActive: boolean;
  usedColorIds: number[];
  colorEventIdsById: Record<string, string>;
  eligibleGuesserIds: number[];
  correctGuesserIds: number[];
  correctGuessEventIdsByPlayer: Record<string, string>;
}

function submittedColorIds(event: TelemetryEventOf<'DRAW_COMMAND_BATCH_SUBMITTED'>): number[] {
  return Array.from(new Set(event.payload.commands.flatMap(command =>
    (command.kind === 'PENCIL' || command.kind === 'FILL')
      && Number.isInteger(command.color)
      && command.color >= 0
      && command.color <= 25
      ? [command.color]
      : []
  ))).sort((left, right) => left - right);
}

function progress(state: ColorPickerState, requiredColors: number): number {
  return Math.min(requiredColors, state.usedColorIds.length);
}

export const colorPickerDefinition: ChallengeDefinition<ColorPickerState, ColorPickerParameters> = {
  id: 'color-picker',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Color Picker',
      'Use all 26 Skribbl colors in one of your drawings and have every eligible player guess it.',
      'Color Picker',
      'Benutze alle 26 Skribbl-Farben in einer Zeichnung und lasse sie von allen berechtigten Spielern erraten.'
    ),
    icon: 'color-picker-palette',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    colors: 26
  },
  // The final step represents the all-players-guessed condition.
  target: parameters => parameters.colors + 1,
  createInitialState: () => ({
    currentRoundSessionId: null,
    roundStartedEventId: null,
    ownDrawingActive: false,
    usedColorIds: [],
    colorEventIdsById: {},
    eligibleGuesserIds: [],
    correctGuesserIds: [],
    correctGuessEventIdsByPlayer: {}
  }),
  validateParameters(value): value is ColorPickerParameters {
    if (typeof value !== 'object' || value === null) return false;
    const colors = (value as Partial<ColorPickerParameters>).colors;
    return isPositiveInteger(colors) && colors <= 26;
  },
  relevantEvents: [
    'ROUND_STARTED',
    'DRAW_COMMAND_BATCH_SUBMITTED',
    'CORRECT_GUESS',
    'PLAYER_LEFT',
    'ROUND_ENDED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      const ownDrawingActive = event.context.meId !== null && event.context.drawerId === event.context.meId;
      const eligibleGuesserIds = ownDrawingActive && Array.isArray(event.payload.players)
        ? event.payload.players
            .map(player => player.id)
            .filter(playerId => playerId !== event.context.drawerId)
        : [];
      return {
        internalState: {
          currentRoundSessionId: roundSessionId,
          roundStartedEventId: event.eventId,
          ownDrawingActive,
          usedColorIds: [],
          colorEventIdsById: {},
          eligibleGuesserIds,
          correctGuesserIds: [],
          correctGuessEventIdsByPlayer: {}
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'color-picker-own-drawing-started'
          : 'color-picker-foreign-drawing-started'
      };
    }

    const state = runtime.internalState;
    if (!state.ownDrawingActive
        || event.context.roundSessionId === null
        || event.context.roundSessionId !== state.currentRoundSessionId) return null;

    if (event.type === 'PLAYER_LEFT') {
      const playerId = event.payload.playerId;
      if (playerId === null || !state.eligibleGuesserIds.includes(playerId)) return null;
      const eligibleGuesserIds = state.eligibleGuesserIds.filter(id => id !== playerId);
      const correctGuesserIds = state.correctGuesserIds.filter(id => id !== playerId);
      const correctGuessEventIdsByPlayer = { ...state.correctGuessEventIdsByPlayer };
      delete correctGuessEventIdsByPlayer[String(playerId)];
      return {
        internalState: {
          ...state,
          eligibleGuesserIds,
          correctGuesserIds,
          correctGuessEventIdsByPlayer
        },
        progress: progress(state, parameters.colors),
        reason: 'color-picker-departed-player-removed-from-eligible-guessers'
      };
    }

    if (event.type === 'DRAW_COMMAND_BATCH_SUBMITTED') {
      if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;
      const observed = submittedColorIds(event);
      if (observed.length === 0) return null;
      const usedColorIds = [...state.usedColorIds];
      const colorEventIdsById = { ...state.colorEventIdsById };
      for (const colorId of observed) {
        if (usedColorIds.includes(colorId)) continue;
        usedColorIds.push(colorId);
        colorEventIdsById[String(colorId)] = event.eventId;
      }
      usedColorIds.sort((left, right) => left - right);
      if (usedColorIds.length === state.usedColorIds.length) return null;
      const nextState = { ...state, usedColorIds, colorEventIdsById };
      return {
        internalState: nextState,
        progress: progress(nextState, parameters.colors),
        reason: 'color-picker-new-palette-color-used'
      };
    }

    if (event.type === 'CORRECT_GUESS') {
      const playerId = event.payload.playerId;
      if (!state.eligibleGuesserIds.includes(playerId)
          || state.correctGuesserIds.includes(playerId)) return null;
      const correctGuesserIds = [...state.correctGuesserIds, playerId];
      const correctGuessEventIdsByPlayer = {
        ...state.correctGuessEventIdsByPlayer,
        [String(playerId)]: event.eventId
      };
      return {
        internalState: { ...state, correctGuesserIds, correctGuessEventIdsByPlayer },
        progress: progress(state, parameters.colors),
        reason: 'color-picker-eligible-player-guessed-own-drawing'
      };
    }

    if (event.type !== 'ROUND_ENDED') return null;
    const allColorsUsed = state.usedColorIds.length >= parameters.colors;
    const everyoneGuessed = state.eligibleGuesserIds.length > 0
      && state.eligibleGuesserIds.every(playerId => state.correctGuesserIds.includes(playerId));
    const complete = allColorsUsed && everyoneGuessed;
    const evidenceEventIds = complete
      ? [
          ...(state.roundStartedEventId ? [state.roundStartedEventId] : []),
          ...state.usedColorIds.map(colorId => state.colorEventIdsById[String(colorId)]),
          ...state.eligibleGuesserIds.map(playerId => state.correctGuessEventIdsByPlayer[String(playerId)]),
          event.eventId
        ].filter((eventId): eventId is string => typeof eventId === 'string')
      : [];
    return {
      internalState: state,
      progress: complete ? parameters.colors + 1 : progress(state, parameters.colors),
      complete,
      reason: complete
        ? 'all-colors-used-and-every-eligible-player-guessed'
        : 'color-picker-round-ended-before-both-conditions',
      evidenceEventIds
    };
  }
};
