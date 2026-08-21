import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface PicassoParameters {
  likes: number;
}

export interface PicassoState {
  qualifyingEvents: number;
  currentRoundSessionId: string | null;
  ownDrawingActive: boolean;
  likedPlayerIds: number[];
  likeEventIdsByPlayer: Record<string, string>;
}

function voteValue(payload: Record<string, unknown>): number | null {
  return typeof payload.vote === 'number' && Number.isFinite(payload.vote)
    ? payload.vote
    : null;
}

function voterId(event: {
  actor: { playerId: number | null; isSelf: boolean } | null;
  payload: Record<string, unknown>;
}): number | null {
  if (event.actor?.isSelf) return null;
  if (event.actor?.playerId !== null && event.actor?.playerId !== undefined) {
    return event.actor.playerId;
  }
  const value = event.payload.playerId;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export const picassoDefinition: ChallengeDefinition<PicassoState, PicassoParameters> = {
  id: 'picasso',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Picasso',
      'Receive at least 4 simultaneous likes on one of your drawings in a public lobby.',
      'Picasso',
      'Erhalte mindestens 4 gleichzeitige Likes auf eine deiner Zeichnungen in einer öffentlichen Lobby.'
    ),
    icon: 'picasso-palette',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: {
    likes: 4
  },
  target: parameters => parameters.likes,
  createInitialState: () => ({
    qualifyingEvents: 0,
    currentRoundSessionId: null,
    ownDrawingActive: false,
    likedPlayerIds: [],
    likeEventIdsByPlayer: {}
  }),
  validateParameters(value): value is PicassoParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<PicassoParameters>).likes);
  },
  relevantEvents: ['ROUND_STARTED', 'VOTE_RECEIVED', 'PLAYER_LEFT'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      const ownDrawingActive = event.context.meId !== null && event.context.drawerId === event.context.meId;

      return {
        internalState: {
          qualifyingEvents: 0,
          currentRoundSessionId: roundSessionId,
          ownDrawingActive,
          likedPlayerIds: [],
          likeEventIdsByPlayer: {}
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'picasso-own-drawing-started'
          : 'picasso-foreign-drawing-started'
      };
    }

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (!runtime.internalState.ownDrawingActive) return null;
    if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;

    if (event.type === 'PLAYER_LEFT') {
      const playerId = voterId(event);
      if (playerId === null || !runtime.internalState.likedPlayerIds.includes(playerId)) return null;

      const likedPlayerIds = runtime.internalState.likedPlayerIds.filter(id => id !== playerId);
      const likeEventIdsByPlayer = { ...runtime.internalState.likeEventIdsByPlayer };
      delete likeEventIdsByPlayer[String(playerId)];

      return {
        internalState: {
          ...runtime.internalState,
          qualifyingEvents: likedPlayerIds.length,
          likedPlayerIds,
          likeEventIdsByPlayer
        },
        progress: likedPlayerIds.length,
        reason: 'picasso-liker-left-before-completion'
      };
    }

    if (event.type !== 'VOTE_RECEIVED') return null;
    const playerId = voterId(event);
    if (playerId === null || playerId === event.context.meId) return null;

    const vote = voteValue(event.payload);
    if (vote !== 0 && vote !== 1) return null;

    const alreadyLiked = runtime.internalState.likedPlayerIds.includes(playerId);
    if (vote === 1 && alreadyLiked) return null;
    if (vote === 0 && !alreadyLiked) return null;

    const likedPlayerIds = vote === 1
      ? [...runtime.internalState.likedPlayerIds, playerId]
      : runtime.internalState.likedPlayerIds.filter(id => id !== playerId);
    const likeEventIdsByPlayer = { ...runtime.internalState.likeEventIdsByPlayer };

    if (vote === 1) {
      likeEventIdsByPlayer[String(playerId)] = event.eventId;
    } else {
      delete likeEventIdsByPlayer[String(playerId)];
    }

    const progress = likedPlayerIds.length;
    const evidenceEventIds = likedPlayerIds
      .map(id => likeEventIdsByPlayer[String(id)])
      .filter((id): id is string => typeof id === 'string');

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: progress,
        likedPlayerIds,
        likeEventIdsByPlayer
      },
      progress,
      complete: progress >= parameters.likes,
      reason: vote === 1
        ? 'picasso-like-added-to-own-drawing'
        : 'picasso-like-removed-from-own-drawing',
      evidenceEventIds
    };
  }
};
