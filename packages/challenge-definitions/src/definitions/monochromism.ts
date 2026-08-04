import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type {
  TelemetryEventOf,
  SkribblUserSnapshot
} from '@skribbl-duels/telemetry-contracts';
import {
  colorFamilyForId,
  colorIdsForFamily,
  type SkribblColorFamily
} from './colorPicker';
import { localization } from '../shared';

export interface MonochromismParameters {
  colorFamilies: 1;
}

export interface MonochromismState {
  currentPlayerIds: number[];
  currentRoundSessionId: string | null;
  ownDrawingActive: boolean;
  eligiblePlayerIds: number[];
  guessedPlayerIds: number[];
  guessEventIdsByPlayer: Record<string, string>;
  usedFamilies: SkribblColorFamily[];
  usedColorIds: number[];
  colorEventIdsByColor: Record<string, string>;
  disqualified: boolean;
  roundStartEventId: string | null;
}

function playerIdsFromSnapshots(players: readonly SkribblUserSnapshot[] | undefined): number[] {
  return players ? Array.from(new Set(players.map(player => player.id))) : [];
}

function joinedPlayerId(event: TelemetryEventOf<'PLAYER_JOINED'>): number | null {
  return event.payload.user?.id ?? event.actor?.playerId ?? null;
}

function leftPlayerId(event: TelemetryEventOf<'PLAYER_LEFT'>): number | null {
  return event.payload.playerId ?? event.payload.player?.id ?? event.actor?.playerId ?? null;
}

function usedColors(event: TelemetryEventOf<'DRAW_COMMAND_BATCH_SUBMITTED'>): {
  colors: number[];
  families: SkribblColorFamily[];
  unknown: boolean;
} {
  const colors = new Set<number>();
  const families = new Set<SkribblColorFamily>();
  let unknown = false;

  for (const command of event.payload.commands) {
    if (command.kind === 'UNKNOWN_DRAW_COMMAND') {
      unknown = true;
      continue;
    }
    if (command.kind !== 'PENCIL' && command.kind !== 'FILL') continue;
    if (command.color === 0) continue;
    const family = colorFamilyForId(command.color);
    if (family === null) {
      unknown = true;
      continue;
    }
    colors.add(command.color);
    families.add(family);
  }

  return {
    colors: Array.from(colors),
    families: Array.from(families),
    unknown
  };
}

export const monochromismDefinition: ChallengeDefinition<
  MonochromismState,
  MonochromismParameters
> = {
  id: 'monochromism',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Monochromism',
      'Have every eligible player guess one of your drawings while using every color in exactly one color family. White erasing does not count as another family.',
      'Monochromism',
      'Lass alle berechtigten Spieler eine deiner Zeichnungen erraten und benutze dabei jede Farbe genau einer Farbreihe. Weiß als Radierer zählt nicht als weitere Reihe.'
    ),
    icon: 'monochromism-single-palette',
    rankedEligible: true,
    difficulty: 6
  },
  defaultParameters: {
    colorFamilies: 1
  },
  target: () => 1,
  createInitialState: () => ({
    currentPlayerIds: [],
    currentRoundSessionId: null,
    ownDrawingActive: false,
    eligiblePlayerIds: [],
    guessedPlayerIds: [],
    guessEventIdsByPlayer: {},
    usedFamilies: [],
    usedColorIds: [],
    colorEventIdsByColor: {},
    disqualified: false,
    roundStartEventId: null
  }),
  validateParameters(value): value is MonochromismParameters {
    return typeof value === 'object' && value !== null &&
      (value as Partial<MonochromismParameters>).colorFamilies === 1;
  },
  relevantEvents: [
    'LOBBY_HYDRATED',
    'PLAYER_JOINED',
    'PLAYER_LEFT',
    'ROUND_STARTED',
    'DRAW_COMMAND_BATCH_SUBMITTED',
    'CORRECT_GUESS'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime }) {
    if (event.type === 'LOBBY_HYDRATED') {
      return {
        internalState: {
          ...runtime.internalState,
          currentPlayerIds: playerIdsFromSnapshots(event.payload.players)
        },
        progress: 0,
        reason: 'monochromism-player-roster-hydrated'
      };
    }

    if (event.type === 'PLAYER_JOINED') {
      const playerId = joinedPlayerId(event);
      if (playerId === null || runtime.internalState.currentPlayerIds.includes(playerId)) return null;
      return {
        internalState: {
          ...runtime.internalState,
          currentPlayerIds: [...runtime.internalState.currentPlayerIds, playerId]
        },
        progress: 0,
        reason: 'monochromism-player-roster-joined'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const playerId = leftPlayerId(event);
      if (playerId === null) return null;
      const guessEventIdsByPlayer = { ...runtime.internalState.guessEventIdsByPlayer };
      delete guessEventIdsByPlayer[String(playerId)];
      return {
        internalState: {
          ...runtime.internalState,
          currentPlayerIds: runtime.internalState.currentPlayerIds.filter(id => id !== playerId),
          eligiblePlayerIds: runtime.internalState.eligiblePlayerIds.filter(id => id !== playerId),
          guessedPlayerIds: runtime.internalState.guessedPlayerIds.filter(id => id !== playerId),
          guessEventIdsByPlayer
        },
        progress: 0,
        reason: 'monochromism-player-left'
      };
    }

    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      const ownDrawingActive = event.context.meId !== null &&
        event.context.drawerId === event.context.meId;
      const snapshotPlayerIds = playerIdsFromSnapshots(event.payload.players);
      const currentPlayerIds = snapshotPlayerIds.length > 0
        ? snapshotPlayerIds
        : runtime.internalState.currentPlayerIds;
      const eligiblePlayerIds = ownDrawingActive && event.context.meId !== null
        ? currentPlayerIds.filter(id => id !== event.context.meId)
        : [];

      return {
        internalState: {
          currentPlayerIds,
          currentRoundSessionId: roundSessionId,
          ownDrawingActive,
          eligiblePlayerIds,
          guessedPlayerIds: [],
          guessEventIdsByPlayer: {},
          usedFamilies: [],
          usedColorIds: [],
          colorEventIdsByColor: {},
          disqualified: false,
          roundStartEventId: event.eventId
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'monochromism-own-drawing-started'
          : 'monochromism-foreign-drawing-started'
      };
    }

    if (!runtime.internalState.ownDrawingActive) return null;
    if (event.context.roundSessionId === null ||
        event.context.roundSessionId !== runtime.internalState.currentRoundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    if (event.type === 'DRAW_COMMAND_BATCH_SUBMITTED') {
      const observed = usedColors(event);
      const usedFamilies = [...runtime.internalState.usedFamilies];
      const usedColorIds = [...runtime.internalState.usedColorIds];
      const colorEventIdsByColor = { ...runtime.internalState.colorEventIdsByColor };
      let changed = false;

      for (const family of observed.families) {
        if (usedFamilies.includes(family)) continue;
        usedFamilies.push(family);
        changed = true;
      }
      for (const colorId of observed.colors) {
        if (usedColorIds.includes(colorId)) continue;
        usedColorIds.push(colorId);
        colorEventIdsByColor[String(colorId)] = event.eventId;
        changed = true;
      }

      const disqualified = runtime.internalState.disqualified || observed.unknown || usedFamilies.length > 1;
      if (!changed && disqualified === runtime.internalState.disqualified) return null;

      return {
        internalState: {
          ...runtime.internalState,
          usedFamilies,
          usedColorIds,
          colorEventIdsByColor,
          disqualified
        },
        progress: 0,
        reason: disqualified
          ? 'monochromism-multiple-or-unknown-color-families'
          : 'monochromism-color-recorded'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    const playerId = event.payload.playerId;
    if (!runtime.internalState.eligiblePlayerIds.includes(playerId)) return null;
    if (runtime.internalState.guessedPlayerIds.includes(playerId)) return null;

    const guessedPlayerIds = [...runtime.internalState.guessedPlayerIds, playerId];
    const guessEventIdsByPlayer = {
      ...runtime.internalState.guessEventIdsByPlayer,
      [String(playerId)]: event.eventId
    };
    const allEligibleGuessed = runtime.internalState.eligiblePlayerIds.length > 0 &&
      runtime.internalState.eligiblePlayerIds.every(id => guessedPlayerIds.includes(id));
    const selectedFamily = runtime.internalState.usedFamilies.length === 1
      ? runtime.internalState.usedFamilies[0] ?? null
      : null;
    const requiredColorIds = selectedFamily === null ? [] : colorIdsForFamily(selectedFamily);
    const usedEveryColor = selectedFamily !== null &&
      requiredColorIds.every(colorId => runtime.internalState.usedColorIds.includes(colorId));
    const validColorRule = !runtime.internalState.disqualified && usedEveryColor;
    const evidenceEventIds = [
      runtime.internalState.roundStartEventId,
      ...requiredColorIds.map(colorId => runtime.internalState.colorEventIdsByColor[String(colorId)]),
      ...runtime.internalState.eligiblePlayerIds.map(id => guessEventIdsByPlayer[String(id)])
    ].filter((id): id is string => typeof id === 'string');

    return {
      internalState: {
        ...runtime.internalState,
        guessedPlayerIds,
        guessEventIdsByPlayer
      },
      progress: allEligibleGuessed && validColorRule ? 1 : 0,
      complete: allEligibleGuessed && validColorRule,
      reason: allEligibleGuessed && validColorRule
        ? 'monochromism-all-colors-and-players-complete'
        : 'monochromism-player-guessed',
      evidenceEventIds
    };
  }
};
