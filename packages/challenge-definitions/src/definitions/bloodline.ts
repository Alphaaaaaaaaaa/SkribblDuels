import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { localization } from '../shared';

export interface BloodlineParameters {
  requiredPathname: string;
}

export interface BloodlineState {
  qualifyingEvents: number;
  navigationId: string | null;
  loadElapsedMs: number | null;
}

export const bloodlineDefinition: ChallengeDefinition<BloodlineState, BloodlineParameters> = {
  id: 'bloodline',
  version: 4,
  metadata: {
    category: 'home',
    localization: localization(
      'Bloodline',
      'Click the Credits link on the homepage.',
      'Bloodline',
      'Klicke auf der Homepage auf den Credits-Link.'
    ),
    icon: 'bloodline-credits',
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    requiredPathname: '/credits'
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    navigationId: null,
    loadElapsedMs: null
  }),
  validateParameters(value): value is BloodlineParameters {
    return typeof value === 'object' && value !== null &&
      typeof (value as Partial<BloodlineParameters>).requiredPathname === 'string' &&
      (value as Partial<BloodlineParameters>).requiredPathname!.startsWith('/');
  },
  relevantEvents: ['CREDITS_LINK_CLICKED'],
  reduce({ event, parameters }) {
    if (event.type !== 'CREDITS_LINK_CLICKED') return null;
    if (event.payload.pathname !== parameters.requiredPathname
        || typeof event.payload.navigationId !== 'string') {
      return null;
    }

    return {
      internalState: {
        qualifyingEvents: 1,
        navigationId: event.payload.navigationId,
        loadElapsedMs: null
      },
      progress: 1,
      complete: true,
      reason: 'credits-link-clicked-on-homepage',
      evidenceEventIds: [event.eventId]
    };
  }
};
