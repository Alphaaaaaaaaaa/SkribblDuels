import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type { SkribblUserSnapshot } from '@skribbl-duels/telemetry-contracts';
import { isFinitePositiveNumber, localization } from '../shared';

export interface TranscendedParameters {
  points: number;
}

export interface TranscendedPlayerScore {
  playerId: number;
  score: number;
  departed: boolean;
}

export interface TranscendedState {
  activeGameSessionId: string | null;
  trackingStartedEventId: string | null;
  selfPlayerId: number | null;
  players: TranscendedPlayerScore[];
  currentLead: number;
}

function initialState(): TranscendedState {
  return {
    activeGameSessionId: null,
    trackingStartedEventId: null,
    selfPlayerId: null,
    players: [],
    currentLead: 0
  };
}

function normalizePlayers(players: readonly SkribblUserSnapshot[] | undefined): TranscendedPlayerScore[] {
  if (!players) return [];
  const byId = new Map<number, TranscendedPlayerScore>();
  for (const player of players) {
    if (!Number.isInteger(player.id) || !Number.isFinite(player.score)) continue;
    byId.set(player.id, { playerId: player.id, score: player.score, departed: false });
  }
  return [...byId.values()];
}

function upsertPlayer(
  players: readonly TranscendedPlayerScore[],
  playerId: number,
  score: number,
  departed = false
): TranscendedPlayerScore[] {
  let found = false;
  const next = players.map(player => {
    if (player.playerId !== playerId) return player;
    found = true;
    return { playerId, score, departed };
  });
  if (!found) next.push({ playerId, score, departed });
  return next;
}

function markDeparted(
  players: readonly TranscendedPlayerScore[],
  playerId: number
): TranscendedPlayerScore[] {
  return players.map(player => player.playerId === playerId ? { ...player, departed: true } : player);
}

function resetScores(players: readonly TranscendedPlayerScore[]): TranscendedPlayerScore[] {
  return players.map(player => ({ ...player, score: 0, departed: false }));
}

function currentLead(players: readonly TranscendedPlayerScore[], selfPlayerId: number): number | null {
  const active = players.filter(player => !player.departed);
  const self = active.find(player => player.playerId === selfPlayerId);
  const opponents = active.filter(player => player.playerId !== selfPlayerId);
  if (!self || self.score <= 0 || opponents.length === 0) return null;
  return self.score - Math.max(...opponents.map(player => player.score));
}

function resultForScoreboard(
  state: TranscendedState,
  players: TranscendedPlayerScore[],
  selfPlayerId: number,
  points: number,
  eventId: string,
  completeReason: string,
  progressReason: string
) {
  const lead = currentLead(players, selfPlayerId);
  const progress = Math.max(0, Math.min(points, lead ?? 0));
  const complete = lead !== null && lead >= points;
  return {
    internalState: {
      ...state,
      selfPlayerId,
      players,
      currentLead: Math.max(0, lead ?? 0)
    },
    progress,
    complete,
    reason: complete ? completeReason : progressReason,
    evidenceEventIds: [
      ...(state.trackingStartedEventId ? [state.trackingStartedEventId] : []),
      eventId
    ]
  };
}

/** First pool-expanding challenge; live certification completed before Ranked enablement. */
export const transcendedDefinition: ChallengeDefinition<TranscendedState, TranscendedParameters> = {
  id: 'transcended',
  version: 1,
  metadata: {
    category: 'progress',
    localization: localization(
      'Transcended',
      'Build a lead of at least 2,000 points over every active opponent in a public game.',
      'Transcended',
      'Baue in einem öffentlichen Spiel mindestens 2.000 Punkte Vorsprung auf jeden aktiven Gegner auf.'
    ),
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: { points: 2_000 },
  target: parameters => parameters.points,
  createInitialState: initialState,
  validateParameters(value): value is TranscendedParameters {
    return typeof value === 'object'
      && value !== null
      && isFinitePositiveNumber((value as Partial<TranscendedParameters>).points);
  },
  relevantEvents: [
    'LOBBY_HYDRATED',
    'PLAYER_JOINED',
    'PLAYER_LEFT',
    'GAME_STARTING',
    'ROUND_STARTED',
    'SCORE_CHANGED',
    'ROUND_RESULTS_AVAILABLE',
    'GAME_ENDED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    const state = runtime.internalState;

    if (event.type === 'LOBBY_HYDRATED') {
      const players = normalizePlayers(event.payload.players);
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (players.length === 0 || gameSessionId === null || selfPlayerId === null) return null;
      const trackingStartedEventId = state.activeGameSessionId === gameSessionId
        ? state.trackingStartedEventId
        : event.eventId;
      return resultForScoreboard(
        { ...state, activeGameSessionId: gameSessionId, trackingStartedEventId },
        players,
        selfPlayerId,
        parameters.points,
        event.eventId,
        'transcended-authoritative-hydration-lead-reached',
        'transcended-authoritative-roster-hydrated'
      );
    }

    if (event.type === 'PLAYER_JOINED') {
      const user = event.payload.user;
      if (!user || !Number.isFinite(user.score)) return null;
      return {
        internalState: {
          ...state,
          players: upsertPlayer(state.players, user.id, user.score, false),
          currentLead: 0
        },
        progress: 0,
        reason: 'transcended-active-opponent-roster-expanded'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const playerId = event.payload.playerId;
      if (playerId === null) return null;
      return {
        internalState: {
          ...state,
          players: markDeparted(state.players, playerId),
          currentLead: 0
        },
        progress: 0,
        reason: 'transcended-departure-does-not-create-lead'
      };
    }

    if (event.type === 'GAME_STARTING') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId === null || selfPlayerId === null) return null;
      return {
        internalState: {
          activeGameSessionId: gameSessionId,
          trackingStartedEventId: event.eventId,
          selfPlayerId,
          players: resetScores(state.players),
          currentLead: 0
        },
        progress: 0,
        reason: 'transcended-new-game-tracking-started',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'ROUND_STARTED') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      const players = normalizePlayers(event.payload.players);
      if (gameSessionId === null || selfPlayerId === null || players.length === 0) return null;
      return resultForScoreboard(
        {
          ...state,
          activeGameSessionId: gameSessionId,
          trackingStartedEventId: state.activeGameSessionId === gameSessionId
            ? state.trackingStartedEventId
            : event.eventId
        },
        players,
        selfPlayerId,
        parameters.points,
        event.eventId,
        'transcended-round-start-scoreboard-lead-reached',
        'transcended-round-scoreboard-synced'
      );
    }

    if (event.type === 'SCORE_CHANGED') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      const playerId = event.payload.playerId;
      const totalScore = event.payload.totalScore;
      if (gameSessionId === null || selfPlayerId === null || playerId === null || totalScore === null || !Number.isFinite(totalScore)) return null;
      const active = state.activeGameSessionId === gameSessionId
        ? state
        : {
            ...state,
            activeGameSessionId: gameSessionId,
            trackingStartedEventId: event.eventId,
            selfPlayerId
          };
      return resultForScoreboard(
        active,
        upsertPlayer(active.players, playerId, totalScore, false),
        selfPlayerId,
        parameters.points,
        event.eventId,
        'transcended-score-lead-reached',
        'transcended-scoreboard-updated'
      );
    }

    if (event.type === 'ROUND_RESULTS_AVAILABLE') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId === null || selfPlayerId === null || event.payload.scores.length === 0) return null;
      let players = state.players;
      for (const score of event.payload.scores) {
        players = upsertPlayer(players, score.playerId, score.totalScore, false);
      }
      return resultForScoreboard(
        {
          ...state,
          activeGameSessionId: gameSessionId,
          trackingStartedEventId: state.activeGameSessionId === gameSessionId
            ? state.trackingStartedEventId
            : event.eventId
        },
        players,
        selfPlayerId,
        parameters.points,
        event.eventId,
        'transcended-round-result-lead-reached',
        'transcended-coherent-round-scoreboard-updated'
      );
    }

    if (event.type === 'GAME_ENDED') {
      const selfPlayerId = event.context.meId ?? state.selfPlayerId;
      if (state.activeGameSessionId !== event.context.gameSessionId || selfPlayerId === null) return null;
      let players = state.players;
      for (const score of event.payload.finalScores ?? []) {
        players = upsertPlayer(players, score.playerId, score.totalScore, false);
      }
      const result = resultForScoreboard(
        state,
        players,
        selfPlayerId,
        parameters.points,
        event.eventId,
        'transcended-final-score-lead-reached',
        'transcended-game-ended-before-required-lead'
      );
      if (result.complete) return result;
      return {
        ...result,
        internalState: initialState(),
        progress: 0
      };
    }

    return null;
  }
};
