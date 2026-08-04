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
  version: 1,
  metadata: {
    category: 'home',
    localization: localization(
      'Bloodline',
      'Open the Credits link from the homepage and let the Credits page finish loading.',
      'Bloodline',
      'Öffne über den Link auf der Homepage die Credits und lasse die Credits-Seite vollständig laden.'
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
  relevantEvents: ['CREDITS_OPENED'],
  reduce({ event, parameters }) {
    if (event.type !== 'CREDITS_OPENED') return null;
    if (event.payload.pathname !== parameters.requiredPathname ||
        event.payload.readyState !== 'complete' ||
        event.payload.linkClickObserved !== true ||
        typeof event.payload.navigationId !== 'string') {
      return null;
    }

    return {
      internalState: {
        qualifyingEvents: 1,
        navigationId: event.payload.navigationId,
        loadElapsedMs: event.payload.loadElapsedMs
      },
      progress: 1,
      complete: true,
      reason: 'credits-link-navigation-completed',
      evidenceEventIds: [event.eventId]
    };
  }
};
