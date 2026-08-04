import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface CoolNumberDetectedParameters {
  divisor: number;
  amount: number;
}

export const coolNumberDetectedDefinition: ChallengeDefinition<
  CounterState,
  CoolNumberDetectedParameters
> = {
  id: 'cool-number-detected',
  version: 1,
  metadata: {
    category: 'progress',
    localization: localization(
      'Cool Number Detected',
      "A player's score in your lobby reaches a positive multiple of 250.",
      'Cool Number Detected',
      'Der Score eines Spielers in deiner Lobby erreicht ein positives Vielfaches von 250.'
    ),
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    divisor: 250,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({ qualifyingEvents: 0 }),
  validateParameters(value): value is CoolNumberDetectedParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<CoolNumberDetectedParameters>;
    return isPositiveInteger(parameters.divisor) && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['SCORE_CHANGED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'SCORE_CHANGED') return null;

    const score = event.payload.totalScore;
    if (score === null || score <= 0 || score % parameters.divisor !== 0) return null;

    const next = nextCounter(runtime.internalState);
    return {
      internalState: next,
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'positive-score-divisible-by-configured-divisor',
      evidenceEventIds: [event.eventId]
    };
  }
};
