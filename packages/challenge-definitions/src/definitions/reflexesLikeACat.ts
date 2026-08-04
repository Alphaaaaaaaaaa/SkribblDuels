import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface ReflexesLikeACatParameters {
  maximumCatchTimeMs: number;
}

export interface ReflexesLikeACatState {
  qualifyingCatchTimeMs: number | null;
  qualifyingDropId: number | string | null;
}

export const reflexesLikeACatDefinition: ChallengeDefinition<
  ReflexesLikeACatState,
  ReflexesLikeACatParameters
> = {
  id: 'reflexes-like-a-cat',
  version: 2,
  metadata: {
    category: 'lucky-fun',
    localization: localization(
      "Drop It Like It's Hot",
      'Catch a Typo drop within 500 milliseconds.',
      "Drop It Like It's Hot",
      'Fange einen Typo-Drop innerhalb von 500 Millisekunden.'
    ),
    icon: 'hot-drop',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    maximumCatchTimeMs: 500
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingCatchTimeMs: null,
    qualifyingDropId: null
  }),
  validateParameters(value): value is ReflexesLikeACatParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<ReflexesLikeACatParameters>).maximumCatchTimeMs);
  },
  relevantEvents: ['TYPO_DROP_CLAIMED'],
  allowedLobbyTypes: [0],
  reduce({ event, parameters }) {
    if (event.type !== 'TYPO_DROP_CLAIMED') return null;
    if (!event.payload.own) return null;
    if (event.payload.catchTimeMs > parameters.maximumCatchTimeMs) return null;

    return {
      internalState: {
        qualifyingCatchTimeMs: event.payload.catchTimeMs,
        qualifyingDropId: event.payload.dropId
      },
      progress: 1,
      complete: true,
      reason: `drop-caught-in-${event.payload.catchTimeMs}-ms`,
      evidenceEventIds: [event.eventId]
    };
  }
};
