import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type {
  SkribblUserSnapshot,
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';
import { localization } from '../shared';

export interface MadeYouSquintParameters {
  minimumWhiteRatio: number;
}

export interface MadeYouSquintState {
  currentPlayerIds: number[];
  currentRoundSessionId: string | null;
  ownDrawingActive: boolean;
  eligiblePlayerIds: number[];
  qualifyingPlayerIds: number[];
  failedPlayerIds: number[];
  metricEventIdsByPlayer: Record<string, string>;
  triggerEventIdsByPlayer: Record<string, string>;
  whiteRatiosByPlayer: Record<string, number>;
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

export const madeYouSquintDefinition: ChallengeDefinition<
  MadeYouSquintState,
  MadeYouSquintParameters
> = {
  id: 'made-you-squint',
  version: 1,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Made you squint!',
      'Have every eligible player guess your drawing while at least 99% of the canvas is still white for each guess.',
      'Made you squint!',
      'Lass alle berechtigten Spieler dein Bild erraten, während bei jedem Guess noch mindestens 99 % der Leinwand weiß sind.'
    ),
    icon: 'made-you-squint-canvas',
    rankedEligible: true,
    difficulty: 7
  },
  defaultParameters: {
    minimumWhiteRatio: 0.99
  },
  target: () => 1,
  createInitialState: () => ({
    currentPlayerIds: [],
    currentRoundSessionId: null,
    ownDrawingActive: false,
    eligiblePlayerIds: [],
    qualifyingPlayerIds: [],
    failedPlayerIds: [],
    metricEventIdsByPlayer: {},
    triggerEventIdsByPlayer: {},
    whiteRatiosByPlayer: {},
    roundStartEventId: null
  }),
  validateParameters(value): value is MadeYouSquintParameters {
    if (typeof value !== 'object' || value === null) return false;
    const ratio = (value as Partial<MadeYouSquintParameters>).minimumWhiteRatio;
    return typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio <= 1;
  },
  relevantEvents: [
    'LOBBY_HYDRATED',
    'PLAYER_JOINED',
    'PLAYER_LEFT',
    'ROUND_STARTED',
    'CANVAS_METRICS'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'LOBBY_HYDRATED') {
      return {
        internalState: {
          ...runtime.internalState,
          currentPlayerIds: playerIdsFromSnapshots(event.payload.players)
        },
        progress: 0,
        reason: 'made-you-squint-player-roster-hydrated'
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
        reason: 'made-you-squint-player-roster-joined'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const playerId = leftPlayerId(event);
      if (playerId === null) return null;
      const metricEventIdsByPlayer = { ...runtime.internalState.metricEventIdsByPlayer };
      const triggerEventIdsByPlayer = { ...runtime.internalState.triggerEventIdsByPlayer };
      const whiteRatiosByPlayer = { ...runtime.internalState.whiteRatiosByPlayer };
      delete metricEventIdsByPlayer[String(playerId)];
      delete triggerEventIdsByPlayer[String(playerId)];
      delete whiteRatiosByPlayer[String(playerId)];
      return {
        internalState: {
          ...runtime.internalState,
          currentPlayerIds: runtime.internalState.currentPlayerIds.filter(id => id !== playerId),
          eligiblePlayerIds: runtime.internalState.eligiblePlayerIds.filter(id => id !== playerId),
          qualifyingPlayerIds: runtime.internalState.qualifyingPlayerIds.filter(id => id !== playerId),
          failedPlayerIds: runtime.internalState.failedPlayerIds.filter(id => id !== playerId),
          metricEventIdsByPlayer,
          triggerEventIdsByPlayer,
          whiteRatiosByPlayer
        },
        progress: 0,
        reason: 'made-you-squint-player-left'
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
          qualifyingPlayerIds: [],
          failedPlayerIds: [],
          metricEventIdsByPlayer: {},
          triggerEventIdsByPlayer: {},
          whiteRatiosByPlayer: {},
          roundStartEventId: event.eventId
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'made-you-squint-own-drawing-started'
          : 'made-you-squint-foreign-drawing-started'
      };
    }

    if (event.type !== 'CANVAS_METRICS') return null;
    if (event.payload.trigger !== 'correct-guess-snapshot') return null;
    if (!runtime.internalState.ownDrawingActive) return null;
    if (event.context.roundSessionId === null ||
        event.context.roundSessionId !== runtime.internalState.currentRoundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    const playerId = event.payload.sampledPlayerId ?? null;
    if (playerId === null || playerId === event.context.meId) return null;
    if (!runtime.internalState.eligiblePlayerIds.includes(playerId)) return null;
    if (runtime.internalState.qualifyingPlayerIds.includes(playerId) ||
        runtime.internalState.failedPlayerIds.includes(playerId)) return null;
    if (event.payload.totalPixels <= 0) return null;

    const qualifying = event.payload.whiteRatio >= parameters.minimumWhiteRatio;
    const qualifyingPlayerIds = qualifying
      ? [...runtime.internalState.qualifyingPlayerIds, playerId]
      : runtime.internalState.qualifyingPlayerIds;
    const failedPlayerIds = qualifying
      ? runtime.internalState.failedPlayerIds
      : [...runtime.internalState.failedPlayerIds, playerId];
    const metricEventIdsByPlayer = {
      ...runtime.internalState.metricEventIdsByPlayer,
      [String(playerId)]: event.eventId
    };
    const triggerEventIdsByPlayer = {
      ...runtime.internalState.triggerEventIdsByPlayer,
      ...(typeof event.payload.triggerEventId === 'string'
        ? { [String(playerId)]: event.payload.triggerEventId }
        : {})
    };
    const whiteRatiosByPlayer = {
      ...runtime.internalState.whiteRatiosByPlayer,
      [String(playerId)]: event.payload.whiteRatio
    };
    const allEligibleQualified = runtime.internalState.eligiblePlayerIds.length > 0 &&
      runtime.internalState.eligiblePlayerIds.every(id => qualifyingPlayerIds.includes(id));
    const evidenceEventIds = [
      runtime.internalState.roundStartEventId,
      ...runtime.internalState.eligiblePlayerIds.flatMap(id => [
        triggerEventIdsByPlayer[String(id)],
        metricEventIdsByPlayer[String(id)]
      ])
    ].filter((id): id is string => typeof id === 'string');

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingPlayerIds,
        failedPlayerIds,
        metricEventIdsByPlayer,
        triggerEventIdsByPlayer,
        whiteRatiosByPlayer
      },
      progress: allEligibleQualified ? 1 : 0,
      complete: allEligibleQualified,
      reason: allEligibleQualified
        ? 'made-you-squint-all-eligible-players-qualified'
        : qualifying
          ? 'made-you-squint-player-qualified'
          : 'made-you-squint-player-below-threshold',
      evidenceEventIds
    };
  }
};
