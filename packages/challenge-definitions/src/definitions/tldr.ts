import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  countVisibleCharacters,
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface TldrParameters {
  minimumCharacters: number;
  amount: number;
}

export interface TldrState extends CounterState {
  longestMessageLength: number;
}

export const tldrDefinition: ChallengeDefinition<TldrState, TldrParameters> = {
  id: 'tldr',
  version: 1,
  metadata: {
    category: 'chat',
    localization: localization(
      'TL;DR',
      'Send a message containing at least 50 visible characters.',
      'TL;DR',
      'Sende eine Nachricht mit mindestens 50 sichtbaren Zeichen.'
    ),
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    minimumCharacters: 50,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    longestMessageLength: 0
  }),
  validateParameters(value): value is TldrParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<TldrParameters>;
    return isPositiveInteger(parameters.minimumCharacters) && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['TEXT_SUBMITTED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'TEXT_SUBMITTED') return null;
    if (!event.actor?.isSelf) return null;
    if (event.payload.message === null) return null;

    const length = countVisibleCharacters(event.payload.message);
    const longestMessageLength = Math.max(runtime.internalState.longestMessageLength, length);

    if (length < parameters.minimumCharacters) {
      if (longestMessageLength === runtime.internalState.longestMessageLength) return null;
      return {
        internalState: {
          ...runtime.internalState,
          longestMessageLength
        },
        reason: 'new-longest-message-below-threshold'
      };
    }

    const next = nextCounter(runtime.internalState);
    return {
      internalState: {
        qualifyingEvents: next.qualifyingEvents,
        longestMessageLength
      },
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-submitted-long-message',
      evidenceEventIds: [event.eventId]
    };
  }
};
