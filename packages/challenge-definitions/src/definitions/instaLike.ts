import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface InstaLikeParameters {
  maximumReactionMs: number;
}

export interface InstaLikeState {
  eligibleRoundSessionId: string | null;
  roundStartedMonotonicMs: number | null;
  roundStartedEventId: string | null;
  qualifyingReactionMs: number | null;
}

function voteValue(payload: Record<string, unknown>): number | null {
  return typeof payload.vote === 'number' && Number.isFinite(payload.vote)
    ? payload.vote
    : null;
}

export const instaLikeDefinition: ChallengeDefinition<InstaLikeState, InstaLikeParameters> = {
  id: 'instalike',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'InstaLike',
      'Like another player\'s drawing within 250 milliseconds after the drawing turn begins.',
      'InstaLike',
      'Like die Zeichnung eines anderen Spielers innerhalb von 250 Millisekunden nach Beginn des Zeichen-Turns.'
    ),
    icon: 'instant-like',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    maximumReactionMs: 250
  },
  target: () => 1,
  createInitialState: () => ({
    eligibleRoundSessionId: null,
    roundStartedMonotonicMs: null,
    roundStartedEventId: null,
    qualifyingReactionMs: null
  }),
  validateParameters(value): value is InstaLikeParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<InstaLikeParameters>).maximumReactionMs);
  },
  relevantEvents: ['ROUND_STARTED', 'VOTE_SUBMITTED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      const meId = event.context.meId;
      const drawerId = event.context.drawerId ?? event.payload.drawerId;
      if (roundSessionId === null || meId === null || drawerId === null || drawerId === meId) {
        return {
          internalState: {
            ...runtime.internalState,
            eligibleRoundSessionId: null,
            roundStartedMonotonicMs: null,
            roundStartedEventId: null
          },
          reason: 'instalike-round-ineligible'
        };
      }

      return {
        internalState: {
          ...runtime.internalState,
          eligibleRoundSessionId: roundSessionId,
          roundStartedMonotonicMs: event.monotonicMs,
          roundStartedEventId: event.eventId,
          qualifyingReactionMs: null
        },
        reason: 'instalike-fresh-foreign-round-observed'
      };
    }

    if (event.type !== 'VOTE_SUBMITTED') return null;
    if (!event.actor?.isSelf || voteValue(event.payload) !== 1) return null;
    if (event.context.gameStateId !== 4 || event.context.gameStateName !== 'DRAWING') return null;
    if (event.context.roundSessionId === null) return null;
    if (runtime.internalState.eligibleRoundSessionId !== event.context.roundSessionId) return null;
    if (runtime.internalState.roundStartedMonotonicMs === null) return null;
    if (runtime.internalState.roundStartedEventId === null) return null;
    if (event.context.meId !== null && event.context.drawerId === event.context.meId) return null;

    const reactionMs = event.monotonicMs - runtime.internalState.roundStartedMonotonicMs;
    if (reactionMs < 0 || reactionMs > parameters.maximumReactionMs) return null;

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingReactionMs: reactionMs
      },
      progress: 1,
      complete: true,
      reason: `drawing-liked-in-${reactionMs}-ms`,
      evidenceEventIds: [runtime.internalState.roundStartedEventId, event.eventId]
    };
  }
};
