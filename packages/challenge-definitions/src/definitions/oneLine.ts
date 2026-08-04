import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type {
  SkribblUserSnapshot,
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';
import { localization } from '../shared';

export interface OneLineParameters {
  strokes: 1;
}

export interface OneLineState {
  currentPlayerIds: number[];
  currentRoundSessionId: string | null;
  ownDrawingActive: boolean;
  eligiblePlayerIds: number[];
  guessedPlayerIds: number[];
  guessEventIdsByPlayer: Record<string, string>;
  strokeIds: string[];
  strokeStartEventIds: Record<string, string>;
  strokeEndEventIds: Record<string, string>;
  disqualified: boolean;
  disqualificationReason: string | null;
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

function batchContainsNonStrokeDrawing(event: TelemetryEventOf<'DRAW_COMMAND_BATCH_SUBMITTED'>): boolean {
  return event.payload.commands.some(command => command.kind !== 'PENCIL');
}

export const oneLineDefinition: ChallengeDefinition<OneLineState, OneLineParameters> = {
  id: 'one-line',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'One Line',
      'Have every eligible player guess your drawing after you used exactly one real pencil stroke.',
      'One Line',
      'Lass alle berechtigten Spieler dein Bild erraten, nachdem du genau einen echten Pinselstrich benutzt hast.'
    ),
    icon: 'one-line-stroke',
    rankedEligible: true,
    difficulty: 6
  },
  defaultParameters: {
    strokes: 1
  },
  target: () => 1,
  createInitialState: () => ({
    currentPlayerIds: [],
    currentRoundSessionId: null,
    ownDrawingActive: false,
    eligiblePlayerIds: [],
    guessedPlayerIds: [],
    guessEventIdsByPlayer: {},
    strokeIds: [],
    strokeStartEventIds: {},
    strokeEndEventIds: {},
    disqualified: false,
    disqualificationReason: null,
    roundStartEventId: null
  }),
  validateParameters(value): value is OneLineParameters {
    return typeof value === 'object' && value !== null &&
      (value as Partial<OneLineParameters>).strokes === 1;
  },
  relevantEvents: [
    'LOBBY_HYDRATED',
    'PLAYER_JOINED',
    'PLAYER_LEFT',
    'ROUND_STARTED',
    'STROKE_STARTED',
    'STROKE_ENDED',
    'DRAW_COMMAND_BATCH_SUBMITTED',
    'CLEAR_CANVAS_SUBMITTED',
    'UNDO_SUBMITTED',
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
        reason: 'one-line-player-roster-hydrated'
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
        reason: 'one-line-player-roster-joined'
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
        reason: 'one-line-player-left'
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
          strokeIds: [],
          strokeStartEventIds: {},
          strokeEndEventIds: {},
          disqualified: false,
          disqualificationReason: null,
          roundStartEventId: event.eventId
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'one-line-own-drawing-started'
          : 'one-line-foreign-drawing-started'
      };
    }

    if (!runtime.internalState.ownDrawingActive) return null;
    if (event.context.roundSessionId === null ||
        event.context.roundSessionId !== runtime.internalState.currentRoundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    if (event.type === 'STROKE_STARTED') {
      if (runtime.internalState.strokeIds.includes(event.payload.strokeId)) return null;
      const strokeIds = [...runtime.internalState.strokeIds, event.payload.strokeId];
      return {
        internalState: {
          ...runtime.internalState,
          strokeIds,
          strokeStartEventIds: {
            ...runtime.internalState.strokeStartEventIds,
            [event.payload.strokeId]: event.eventId
          },
          disqualified: runtime.internalState.disqualified || strokeIds.length > 1,
          disqualificationReason: strokeIds.length > 1
            ? 'more-than-one-stroke'
            : runtime.internalState.disqualificationReason
        },
        progress: 0,
        reason: strokeIds.length > 1
          ? 'one-line-second-stroke-disqualified'
          : 'one-line-first-stroke-started'
      };
    }

    if (event.type === 'STROKE_ENDED') {
      if (!runtime.internalState.strokeIds.includes(event.payload.strokeId)) return null;
      return {
        internalState: {
          ...runtime.internalState,
          strokeEndEventIds: {
            ...runtime.internalState.strokeEndEventIds,
            [event.payload.strokeId]: event.eventId
          }
        },
        progress: 0,
        reason: 'one-line-stroke-ended'
      };
    }

    if (event.type === 'DRAW_COMMAND_BATCH_SUBMITTED' && batchContainsNonStrokeDrawing(event)) {
      return {
        internalState: {
          ...runtime.internalState,
          disqualified: true,
          disqualificationReason: 'non-pencil-drawing-command'
        },
        progress: 0,
        reason: 'one-line-non-pencil-command-disqualified'
      };
    }

    if (event.type === 'CLEAR_CANVAS_SUBMITTED' || event.type === 'UNDO_SUBMITTED') {
      return {
        internalState: {
          ...runtime.internalState,
          disqualified: true,
          disqualificationReason: event.type === 'CLEAR_CANVAS_SUBMITTED'
            ? 'canvas-cleared'
            : 'stroke-undone'
        },
        progress: 0,
        reason: event.type === 'CLEAR_CANVAS_SUBMITTED'
          ? 'one-line-clear-disqualified'
          : 'one-line-undo-disqualified'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    const playerId = event.payload.playerId;
    if (!runtime.internalState.eligiblePlayerIds.includes(playerId)) return null;
    if (runtime.internalState.guessedPlayerIds.includes(playerId)) return null;
    if (runtime.internalState.disqualified || runtime.internalState.strokeIds.length !== 1) return null;

    const guessedPlayerIds = [...runtime.internalState.guessedPlayerIds, playerId];
    const guessEventIdsByPlayer = {
      ...runtime.internalState.guessEventIdsByPlayer,
      [String(playerId)]: event.eventId
    };
    const allEligibleGuessed = runtime.internalState.eligiblePlayerIds.length > 0 &&
      runtime.internalState.eligiblePlayerIds.every(id => guessedPlayerIds.includes(id));
    const strokeId = runtime.internalState.strokeIds[0];
    const evidenceEventIds = [
      runtime.internalState.roundStartEventId,
      strokeId ? runtime.internalState.strokeStartEventIds[strokeId] : undefined,
      strokeId ? runtime.internalState.strokeEndEventIds[strokeId] : undefined,
      ...runtime.internalState.eligiblePlayerIds.map(id => guessEventIdsByPlayer[String(id)])
    ].filter((id): id is string => typeof id === 'string');

    return {
      internalState: {
        ...runtime.internalState,
        guessedPlayerIds,
        guessEventIdsByPlayer
      },
      progress: allEligibleGuessed ? 1 : 0,
      complete: allEligibleGuessed,
      reason: allEligibleGuessed
        ? 'one-line-all-eligible-players-guessed'
        : 'one-line-player-guessed',
      evidenceEventIds
    };
  }
};
