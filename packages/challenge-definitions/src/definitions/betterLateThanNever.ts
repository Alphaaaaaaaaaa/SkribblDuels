import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isFinitePositiveNumber,
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface BetterLateThanNeverParameters {
  remainingSeconds: number;
  amount: number;
}

export const betterLateThanNeverDefinition: ChallengeDefinition<
  CounterState,
  BetterLateThanNeverParameters
> = {
  id: 'better-late-than-never',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Better late than never',
      'Guess a word during the final second.',
      'Better late than never',
      'Errate ein Wort in der letzten Sekunde.'
    ),
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    remainingSeconds: 1,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({ qualifyingEvents: 0 }),
  validateParameters(value): value is BetterLateThanNeverParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<BetterLateThanNeverParameters>;
    return isFinitePositiveNumber(parameters.remainingSeconds) &&
      isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;

    const remaining = event.payload.estimatedTimeAtGuess;
    if (remaining === null || remaining < 0 || remaining > parameters.remainingSeconds) {
      return null;
    }

    const next = nextCounter(runtime.internalState);
    return {
      internalState: next,
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-guessed-in-final-time-window',
      evidenceEventIds: [event.eventId]
    };
  }
};
