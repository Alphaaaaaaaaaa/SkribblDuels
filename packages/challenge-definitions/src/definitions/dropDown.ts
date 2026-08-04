import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface DropDownParameters {
  minimumCatchTimeMs: number;
}

export interface DropDownState {
  qualifyingCatchTimeMs: number | null;
  qualifyingDropId: number | string | null;
}

export const dropDownDefinition: ChallengeDefinition<
  DropDownState,
  DropDownParameters
> = {
  id: 'drop-down',
  version: 2,
  metadata: {
    category: 'lucky-fun',
    localization: localization(
      'Final Drop',
      'Catch the final clearing Typo drop after at least one second.',
      'Final Drop',
      'Fange den finalen Typo-Drop nach mindestens einer Sekunde.'
    ),
    icon: 'final-drop',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    minimumCatchTimeMs: 1000
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingCatchTimeMs: null,
    qualifyingDropId: null
  }),
  validateParameters(value): value is DropDownParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<DropDownParameters>).minimumCatchTimeMs);
  },
  relevantEvents: ['TYPO_DROP_CLAIMED'],
  allowedLobbyTypes: [0],
  reduce({ event, parameters }) {
    if (event.type !== 'TYPO_DROP_CLAIMED') return null;
    if (!event.payload.own || !event.payload.clearedDrop) return null;
    if (event.payload.catchTimeMs < parameters.minimumCatchTimeMs) return null;

    return {
      internalState: {
        qualifyingCatchTimeMs: event.payload.catchTimeMs,
        qualifyingDropId: event.payload.dropId
      },
      progress: 1,
      complete: true,
      reason: `final-drop-caught-in-${event.payload.catchTimeMs}-ms`,
      evidenceEventIds: [event.eventId]
    };
  }
};
