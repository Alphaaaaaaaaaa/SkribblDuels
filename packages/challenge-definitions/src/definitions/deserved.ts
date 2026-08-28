import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type { SkribblUserSnapshot } from '@skribbl-duels/telemetry-contracts';
import { localization } from '../shared';

export interface DeservedPlayerScore {
  playerId: number;
  score: number;
  departed: boolean;
}

export interface DeservedState {
  activeGameSessionId: string | null;
  trackingStartedEventId: string | null;
  selfPlayerId: number | null;
  players: DeservedPlayerScore[];
  lobbyPlayers: DeservedPlayerScore[];
  selfWasFirstGuesser: boolean;
  firstGuesserEventId: string | null;
}

export interface DeservedParameters {}

function normalizePlayers(players: readonly SkribblUserSnapshot[] | undefined): DeservedPlayerScore[] {
  if (!players) return [];
  const byId = new Map<number, DeservedPlayerScore>();
  for (const player of players) {
    if (!Number.isInteger(player.id) || !Number.isFinite(player.score)) continue;
    byId.set(player.id, {
      playerId: player.id,
      score: player.score,
      departed: false
    });
  }
  return Array.from(byId.values());
}

function upsertPlayer(
  players: readonly DeservedPlayerScore[],
  playerId: number,
  score: number,
  departed = false
): DeservedPlayerScore[] {
  let found = false;
  const next = players.map(player => {
    if (player.playerId !== playerId) return player;
    found = true;
    return { playerId, score, departed };
  });
  if (!found) next.push({ playerId, score, departed });
  return next;
}

function markDeparted(players: readonly DeservedPlayerScore[], playerId: number): DeservedPlayerScore[] {
  return players.map(player => player.playerId === playerId ? { ...player, departed: true } : player);
}

function resetScores(players: readonly DeservedPlayerScore[]): DeservedPlayerScore[] {
  return players.map(player => ({ ...player, score: 0, departed: false }));
}

function isStrictPositiveFirst(players: readonly DeservedPlayerScore[], selfPlayerId: number): boolean {
  const active = players.filter(player => !player.departed);
  const self = active.find(player => player.playerId === selfPlayerId);
  const opponents = active.filter(player => player.playerId !== selfPlayerId);
  if (!self || self.score <= 0 || opponents.length === 0) return false;
  return opponents.every(player => self.score > player.score);
}

function initialState(): DeservedState {
  return {
    activeGameSessionId: null,
    trackingStartedEventId: null,
    selfPlayerId: null,
    players: [],
    lobbyPlayers: [],
    selfWasFirstGuesser: false,
    firstGuesserEventId: null
  };
}

function startTracking(
  state: DeservedState,
  gameSessionId: string,
  selfPlayerId: number,
  eventId: string,
  players?: readonly SkribblUserSnapshot[]
): DeservedState {
  const snapshot = normalizePlayers(players);
  const baseline = snapshot.length > 0 ? snapshot : state.lobbyPlayers;
  const nextPlayers = baseline.some(player => player.playerId === selfPlayerId)
    ? baseline
    : [...baseline, { playerId: selfPlayerId, score: 0, departed: false }];
  return {
    ...state,
    activeGameSessionId: gameSessionId,
    trackingStartedEventId: eventId,
    selfPlayerId,
    players: nextPlayers,
    lobbyPlayers: snapshot.length > 0 ? snapshot : state.lobbyPlayers,
    selfWasFirstGuesser: false,
    firstGuesserEventId: null
  };
}

export const deservedDefinition: ChallengeDefinition<DeservedState, DeservedParameters> = {
  id: 'deserved',
  version: 5,
  metadata: {
    category: 'progress',
    localization: localization(
      'Deserved?',
      'Reach sole first place in a public game with a positive score, without ever being the first guesser during the observed part of that game. Zero points and tied leads do not count.',
      'Deserved?',
      'Erreiche in einem öffentlichen Spiel allein Platz 1 mit positiver Punktzahl, ohne im beobachteten Teil dieses Spiels jemals First Guesser gewesen zu sein. Null Punkte und Gleichstände zählen nicht.'
    ),
    icon: 'deserved-first-place',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {},
  target: () => 1,
  createInitialState: initialState,
  validateParameters(value): value is DeservedParameters {
    return typeof value === 'object' && value !== null;
  },
  relevantEvents: [
    'LOBBY_HYDRATED',
    'PLAYER_JOINED',
    'PLAYER_LEFT',
    'GAME_STARTING',
    'ROUND_STARTED',
    'SCORE_CHANGED',
    'FIRST_GUESS',
    'ROUND_RESULTS_AVAILABLE',
    'GAME_ENDED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime }) {
    const state = runtime.internalState;

    if (event.type === 'LOBBY_HYDRATED') {
      const lobbyPlayers = normalizePlayers(event.payload.players);
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId !== null && selfPlayerId !== null) {
        const next = state.activeGameSessionId === gameSessionId
          ? {
              ...state,
              selfPlayerId,
              players: lobbyPlayers.length > 0 ? lobbyPlayers : state.players,
              lobbyPlayers: lobbyPlayers.length > 0 ? lobbyPlayers : state.lobbyPlayers
            }
          : startTracking({ ...state, lobbyPlayers }, gameSessionId, selfPlayerId, event.eventId, event.payload.players);
        return {
          internalState: next,
          progress: 0,
          reason: state.activeGameSessionId === gameSessionId
            ? 'deserved-current-game-hydration-refreshed'
            : 'deserved-mid-game-observation-started',
          evidenceEventIds: [event.eventId]
        };
      }
      return {
        internalState: {
          ...state,
          lobbyPlayers: lobbyPlayers.length > 0 ? lobbyPlayers : state.lobbyPlayers
        },
        reason: 'deserved-lobby-roster-synced'
      };
    }

    if (event.type === 'PLAYER_JOINED') {
      const user = event.payload.user;
      if (!user) return null;
      return {
        internalState: {
          ...state,
          lobbyPlayers: upsertPlayer(state.lobbyPlayers, user.id, user.score, false),
          players: state.activeGameSessionId === event.context.gameSessionId
            ? upsertPlayer(state.players, user.id, user.score, false)
            : state.players
        },
        reason: 'deserved-player-joined'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const playerId = event.payload.playerId;
      if (playerId === null) return null;
      return {
        internalState: {
          ...state,
          lobbyPlayers: markDeparted(state.lobbyPlayers, playerId),
          players: markDeparted(state.players, playerId)
        },
        reason: 'deserved-player-left'
      };
    }

    if (event.type === 'GAME_STARTING') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId === null || selfPlayerId === null) return null;
      if (state.activeGameSessionId === gameSessionId) return null;
      const players = resetScores(state.lobbyPlayers);
      return {
        internalState: startTracking({ ...state, lobbyPlayers: players }, gameSessionId, selfPlayerId, event.eventId),
        progress: 0,
        reason: 'deserved-new-game-observation-started',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'ROUND_STARTED') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId === null || selfPlayerId === null) return null;
      const snapshot = normalizePlayers(event.payload.players);
      if (state.activeGameSessionId !== gameSessionId) {
        return {
          internalState: startTracking(state, gameSessionId, selfPlayerId, event.eventId, event.payload.players),
          progress: 0,
          reason: 'deserved-current-game-observation-started-from-round',
          evidenceEventIds: [event.eventId]
        };
      }
      if (snapshot.length === 0) return null;
      return {
        internalState: {
          ...state,
          selfPlayerId,
          players: snapshot,
          lobbyPlayers: snapshot
        },
        reason: 'deserved-round-roster-synced'
      };
    }

    if (event.type === 'FIRST_GUESS') {
      if (!event.actor?.isSelf) return null;
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId === null || selfPlayerId === null) return null;
      const active = state.activeGameSessionId === gameSessionId
        ? state
        : startTracking(state, gameSessionId, selfPlayerId, event.eventId);
      return {
        internalState: {
          ...active,
          selfWasFirstGuesser: true,
          firstGuesserEventId: event.eventId
        },
        progress: 0,
        reason: 'deserved-self-became-first-guesser',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'SCORE_CHANGED') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      const playerId = event.payload.playerId;
      const totalScore = event.payload.totalScore;
      if (gameSessionId === null || selfPlayerId === null || playerId === null || totalScore === null || !Number.isFinite(totalScore)) return null;

      const active = state.activeGameSessionId === gameSessionId
        ? state
        : startTracking(state, gameSessionId, selfPlayerId, event.eventId);
      const players = upsertPlayer(active.players, playerId, totalScore, false);
      // Skribbl can deliver the per-player score changes that make up one
      // visible scoreboard update sequentially. Certifying on the first item
      // in that batch creates a transient false lead before the remaining
      // players have been updated. Keep the roster current here and certify
      // only on coherent ROUND_RESULTS_AVAILABLE / GAME_ENDED snapshots.
      return {
        internalState: {
          ...active,
          selfPlayerId,
          players,
          lobbyPlayers: upsertPlayer(active.lobbyPlayers, playerId, totalScore, false)
        },
        progress: 0,
        reason: 'deserved-scoreboard-component-updated'
      };
    }

    if (event.type === 'ROUND_RESULTS_AVAILABLE') {
      const gameSessionId = event.context.gameSessionId;
      const selfPlayerId = event.context.meId;
      if (gameSessionId === null || selfPlayerId === null || event.payload.scores.length === 0) return null;
      const active = state.activeGameSessionId === gameSessionId
        ? state
        : startTracking(state, gameSessionId, selfPlayerId, event.eventId);
      // Skribbl round-result score arrays may omit players who earned no
      // points in that turn. Merge them into the last complete roster instead
      // of treating the partial array as the entire ranking.
      let players = active.players;
      for (const score of event.payload.scores) {
        players = upsertPlayer(players, score.playerId, score.totalScore, false);
      }
      const reachedFirst = !active.selfWasFirstGuesser && isStrictPositiveFirst(players, selfPlayerId);
      const evidenceEventIds = [
        ...(active.trackingStartedEventId ? [active.trackingStartedEventId] : []),
        event.eventId
      ];
      return {
        internalState: {
          ...active,
          selfPlayerId,
          players,
          lobbyPlayers: players
        },
        progress: reachedFirst ? 1 : 0,
        complete: reachedFirst,
        reason: reachedFirst
          ? 'deserved-coherent-strict-positive-first-place-without-first-guess'
          : active.selfWasFirstGuesser
            ? 'deserved-round-finished-after-self-first-guess'
            : 'deserved-coherent-round-ranking-not-first',
        evidenceEventIds
      };
    }

    if (event.type === 'GAME_ENDED') {
      if (state.activeGameSessionId === null || state.activeGameSessionId !== event.context.gameSessionId) return null;
      const selfPlayerId = event.context.meId ?? state.selfPlayerId;
      let finalPlayers = state.players;
      for (const score of event.payload.finalScores ?? []) {
        finalPlayers = upsertPlayer(finalPlayers, score.playerId, score.totalScore, false);
      }
      const reachedFirst = selfPlayerId !== null
        && !state.selfWasFirstGuesser
        && isStrictPositiveFirst(finalPlayers, selfPlayerId);
      if (reachedFirst) {
        return {
          internalState: {
            ...state,
            selfPlayerId,
            players: finalPlayers,
            lobbyPlayers: finalPlayers
          },
          progress: 1,
          complete: true,
          reason: 'deserved-strict-positive-final-ranking-without-first-guess',
          evidenceEventIds: [
            ...(state.trackingStartedEventId ? [state.trackingStartedEventId] : []),
            event.eventId
          ]
        };
      }
      return {
        internalState: {
          ...state,
          activeGameSessionId: null,
          trackingStartedEventId: null,
          players: [],
          selfWasFirstGuesser: false,
          firstGuesserEventId: null
        },
        progress: 0,
        reason: 'deserved-game-ended-before-completion',
        evidenceEventIds: [event.eventId]
      };
    }

    return null;
  }
};
