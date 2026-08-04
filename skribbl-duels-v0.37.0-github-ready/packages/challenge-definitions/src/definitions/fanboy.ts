import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface FanboyParameters {
  drawings: number;
}

export interface FanboyState {
  qualifyingEvents: number;
  likedRoundSessionIds: string[];
  evidenceEventIds: string[];
}

function voteValue(payload: Record<string, unknown>): number | null {
  return typeof payload.vote === 'number' && Number.isFinite(payload.vote)
    ? payload.vote
    : null;
}

export const fanboyDefinition: ChallengeDefinition<FanboyState, FanboyParameters> = {
  id: 'fanboy',
  version: 1,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Fanboy',
      'Like 3 different drawings in public lobbies. Each drawing turn can count only once.',
      'Fanboy',
      'Like 3 verschiedene Zeichnungen in öffentlichen Lobbys. Jeder Zeichen-Turn kann nur einmal zählen.'
    ),
    icon: 'fanboy-like',
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    drawings: 3
  },
  target: parameters => parameters.drawings,
  createInitialState: () => ({
    qualifyingEvents: 0,
    likedRoundSessionIds: [],
    evidenceEventIds: []
  }),
  validateParameters(value): value is FanboyParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<FanboyParameters>).drawings);
  },
  relevantEvents: ['VOTE_SUBMITTED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'VOTE_SUBMITTED') return null;
    if (!event.actor?.isSelf) return null;
    if (voteValue(event.payload) !== 1) return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (event.context.gameStateName !== 'DRAWING' || event.context.gameStateId !== 4) return null;
    if (event.context.meId !== null && event.context.drawerId === event.context.meId) return null;
    if (runtime.internalState.likedRoundSessionIds.includes(roundSessionId)) return null;

    const likedRoundSessionIds = [
      ...runtime.internalState.likedRoundSessionIds,
      roundSessionId
    ];
    const evidenceEventIds = [
      ...runtime.internalState.evidenceEventIds,
      event.eventId
    ];
    const progress = likedRoundSessionIds.length;

    return {
      internalState: {
        qualifyingEvents: progress,
        likedRoundSessionIds,
        evidenceEventIds
      },
      progress,
      complete: progress >= parameters.drawings,
      reason: 'fanboy-liked-distinct-drawing-turn',
      evidenceEventIds
    };
  }
};
