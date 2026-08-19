import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface FanboyParameters {
  drawings: number;
}

export interface FanboyState {
  qualifyingEvents: number;
  gameSessionId: string | null;
  gameStartObserved: boolean;
  roundNumber: number | null;
  currentRoundSessionId: string | null;
  expectedDrawerIds: number[];
  observedDrawerIds: number[];
  eligibleRoundSessionIds: string[];
  likedRoundSessionIds: string[];
  roundEventIds: Record<string, string>;
  likeEventIds: Record<string, string>;
  missedDrawing: boolean;
}

function voteValue(payload: Record<string, unknown>): number | null {
  return typeof payload.vote === 'number' && Number.isFinite(payload.vote)
    ? payload.vote
    : null;
}

function initialState(gameSessionId: string | null = null): FanboyState {
  return {
    qualifyingEvents: 0,
    gameSessionId,
    gameStartObserved: gameSessionId !== null,
    roundNumber: null,
    currentRoundSessionId: null,
    expectedDrawerIds: [],
    observedDrawerIds: [],
    eligibleRoundSessionIds: [],
    likedRoundSessionIds: [],
    roundEventIds: {},
    likeEventIds: {},
    missedDrawing: false
  };
}

function cycleTarget(state: FanboyState, parameters: FanboyParameters): number {
  return Math.max(
    parameters.drawings,
    state.expectedDrawerIds.length,
    state.eligibleRoundSessionIds.length
  ) + 1;
}

function cycleComplete(state: FanboyState, parameters: FanboyParameters): boolean {
  const observedEnough = state.expectedDrawerIds.length > 0
    ? state.expectedDrawerIds.every(playerId => state.observedDrawerIds.includes(playerId))
    : state.eligibleRoundSessionIds.length >= parameters.drawings;
  return observedEnough
    && !state.missedDrawing
    && state.eligibleRoundSessionIds.length >= parameters.drawings
    && state.eligibleRoundSessionIds.every(roundSessionId =>
      state.likedRoundSessionIds.includes(roundSessionId));
}

function completionEvidence(state: FanboyState, boundaryEventId: string): string[] {
  return [
    ...state.eligibleRoundSessionIds.map(id => state.roundEventIds[id]),
    ...state.eligibleRoundSessionIds.map(id => state.likeEventIds[id]),
    boundaryEventId
  ].filter((eventId): eventId is string => typeof eventId === 'string');
}

export const fanboyDefinition: ChallengeDefinition<FanboyState, FanboyParameters> = {
  id: 'fanboy',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Fanboy',
      'Like every eligible drawing in one fully observed Skribbl round.',
      'Fanboy',
      'Like jedes berechtigte Bild in einer vollständig beobachteten Skribbl-Runde.'
    ),
    icon: 'fanboy-like',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    drawings: 1
  },
  // One final step is reserved for the next-round or game-end boundary.
  target: parameters => parameters.drawings + 1,
  createInitialState: () => initialState(),
  validateParameters(value): value is FanboyParameters {
    return typeof value === 'object' && value !== null
      && isPositiveInteger((value as Partial<FanboyParameters>).drawings);
  },
  relevantEvents: ['GAME_STARTING', 'ROUND_STARTED', 'VOTE_SUBMITTED', 'ROUND_ENDED', 'PLAYER_LEFT', 'GAME_ENDED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'GAME_STARTING') {
      return {
        internalState: initialState(event.context.gameSessionId),
        progress: 0,
        target: parameters.drawings + 1,
        reason: 'fanboy-round-observation-started'
      };
    }

    const state = runtime.internalState;
    if (!state.gameStartObserved
        || state.gameSessionId === null
        || event.context.gameSessionId !== state.gameSessionId) return null;

    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      const nextRoundNumber = event.context.roundNumber;
      const newRoundBoundary = state.roundNumber !== null
        && nextRoundNumber !== null
        && nextRoundNumber !== state.roundNumber;
      if (newRoundBoundary && cycleComplete(state, parameters)) {
        const target = cycleTarget(state, parameters);
        return {
          internalState: { ...state, qualifyingEvents: state.eligibleRoundSessionIds.length },
          progress: target,
          target,
          complete: true,
          reason: 'fanboy-liked-every-drawing-before-next-round',
          evidenceEventIds: completionEvidence(state, event.eventId)
        };
      }

      const base = state.roundNumber === null || newRoundBoundary
        ? { ...initialState(state.gameSessionId), roundNumber: nextRoundNumber }
        : state;
      const players = Array.isArray(event.payload.players) ? event.payload.players : [];
      const expectedDrawerIds = Array.from(new Set([
        ...base.expectedDrawerIds,
        ...players.map(player => player.id).filter(playerId => playerId !== event.context.meId)
      ]));
      const ownDrawing = event.context.meId !== null && event.context.drawerId === event.context.meId;
      if (ownDrawing) {
        const nextState = { ...base, expectedDrawerIds, currentRoundSessionId: null };
        return {
          internalState: nextState,
          progress: nextState.likedRoundSessionIds.length,
          target: cycleTarget(nextState, parameters),
          reason: 'fanboy-own-drawing-does-not-require-a-like'
        };
      }
      if (base.eligibleRoundSessionIds.includes(roundSessionId)) return null;
      const eligibleRoundSessionIds = [...base.eligibleRoundSessionIds, roundSessionId];
      const observedDrawerIds = event.context.drawerId === null
        ? base.observedDrawerIds
        : Array.from(new Set([...base.observedDrawerIds, event.context.drawerId]));
      const nextState = {
        ...base,
        roundNumber: nextRoundNumber,
        currentRoundSessionId: roundSessionId,
        expectedDrawerIds,
        observedDrawerIds,
        eligibleRoundSessionIds,
        roundEventIds: { ...base.roundEventIds, [roundSessionId]: event.eventId }
      };
      return {
        internalState: nextState,
        progress: nextState.likedRoundSessionIds.length,
        target: cycleTarget(nextState, parameters),
        reason: 'fanboy-eligible-drawing-started'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const playerId = event.payload.playerId;
      if (playerId === null
          || state.observedDrawerIds.includes(playerId)
          || !state.expectedDrawerIds.includes(playerId)) return null;
      const nextState = {
        ...state,
        expectedDrawerIds: state.expectedDrawerIds.filter(id => id !== playerId)
      };
      return {
        internalState: nextState,
        target: cycleTarget(nextState, parameters),
        reason: 'fanboy-undrawn-departed-player-removed'
      };
    }

    if (event.type === 'VOTE_SUBMITTED') {
      const roundSessionId = event.context.roundSessionId;
      if (!event.actor?.isSelf
          || roundSessionId === null
          || state.currentRoundSessionId !== roundSessionId
          || !state.eligibleRoundSessionIds.includes(roundSessionId)) return null;
      const liked = voteValue(event.payload) === 1;
      const likedRoundSessionIds = liked
        ? Array.from(new Set([...state.likedRoundSessionIds, roundSessionId]))
        : state.likedRoundSessionIds.filter(id => id !== roundSessionId);
      const likeEventIds = { ...state.likeEventIds };
      if (liked) likeEventIds[roundSessionId] = event.eventId;
      else delete likeEventIds[roundSessionId];
      const nextState = { ...state, likedRoundSessionIds, likeEventIds };
      return {
        internalState: nextState,
        progress: likedRoundSessionIds.length,
        target: cycleTarget(nextState, parameters),
        reason: liked ? 'fanboy-current-drawing-liked' : 'fanboy-current-drawing-like-removed'
      };
    }

    if (event.type === 'ROUND_ENDED') {
      const roundSessionId = state.currentRoundSessionId;
      if (roundSessionId === null) return null;
      const missedDrawing = state.missedDrawing || !state.likedRoundSessionIds.includes(roundSessionId);
      return {
        internalState: { ...state, currentRoundSessionId: null, missedDrawing },
        progress: state.likedRoundSessionIds.length,
        target: cycleTarget(state, parameters),
        reason: missedDrawing ? 'fanboy-drawing-ended-without-like' : 'fanboy-liked-drawing-finished'
      };
    }

    if (event.type !== 'GAME_ENDED') return null;
    const target = cycleTarget(state, parameters);
    const complete = cycleComplete(state, parameters);
    return {
      internalState: { ...state, qualifyingEvents: complete ? state.eligibleRoundSessionIds.length : 0 },
      progress: complete ? target : state.likedRoundSessionIds.length,
      target,
      complete,
      reason: complete
        ? 'fanboy-liked-every-drawing-in-observed-round'
        : 'fanboy-observed-round-contained-unliked-or-missing-drawing',
      evidenceEventIds: complete ? completionEvidence(state, event.eventId) : []
    };
  }
};
