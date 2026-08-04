import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isFinitePositiveNumber,
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface QuickscopeParameters {
  seconds: number;
  amount: number;
}

export interface QuickscopeState extends CounterState {
  /**
   * A Quickscope may only be completed in a round whose ROUND_STARTED event
   * was observed after this challenge instance became active. Joining an
   * already-running round therefore cannot qualify.
   */
  eligibleRoundSessionId: string | null;
  roundStartedEventId: string | null;
}

export const quickscopeDefinition: ChallengeDefinition<QuickscopeState, QuickscopeParameters> = {
  id: 'quickscope',
  version: 2,
  metadata: {
    category: 'guessing',
    localization: localization(
      "Quickscope'd",
      'Guess a word in 5 seconds or less after witnessing the round start.',
      "Quickscope'd",
      'Errate ein Wort innerhalb von höchstens 5 Sekunden, nachdem du den Rundenstart erlebt hast.'
    ),
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    seconds: 5,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    eligibleRoundSessionId: null,
    roundStartedEventId: null
  }),
  validateParameters(value): value is QuickscopeParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<QuickscopeParameters>;
    return isFinitePositiveNumber(parameters.seconds) && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['ROUND_STARTED', 'CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;

      return {
        internalState: {
          ...runtime.internalState,
          eligibleRoundSessionId: roundSessionId,
          roundStartedEventId: event.eventId
        },
        reason: 'fresh-round-start-observed'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;
    if (event.payload.elapsedMs === null) return null;
    if (event.payload.elapsedMs > parameters.seconds * 1000) return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (runtime.internalState.eligibleRoundSessionId !== roundSessionId) return null;
    if (runtime.internalState.roundStartedEventId === null) return null;

    const next = nextCounter(runtime.internalState);
    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: next.qualifyingEvents
      },
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-guessed-within-time-limit-after-fresh-round-start',
      evidenceEventIds: [runtime.internalState.roundStartedEventId, event.eventId]
    };
  }
};
