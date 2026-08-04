import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface OuchParameters {
  milliseconds: number;
  amount: number;
}

export interface OuchState extends CounterState {
  eligibleRoundSessionId: string | null;
  firstGuessElapsedMs: number | null;
  firstGuessEventId: string | null;
}

export const ouchDefinition: ChallengeDefinition<OuchState, OuchParameters> = {
  id: 'ouch',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Ouch',
      'Guess the word within half a second after the first guesser.',
      'Ouch',
      'Errate das Wort innerhalb einer halben Sekunde nach dem First Guesser.'
    ),
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: {
    milliseconds: 500,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    eligibleRoundSessionId: null,
    firstGuessElapsedMs: null,
    firstGuessEventId: null
  }),
  validateParameters(value): value is OuchParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<OuchParameters>;
    return isPositiveInteger(parameters.milliseconds) && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['ROUND_STARTED', 'FIRST_GUESS', 'CORRECT_GUESS'],
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
          firstGuessElapsedMs: null,
          firstGuessEventId: null
        },
        reason: 'ouch-round-start-observed'
      };
    }

    if (event.type === 'FIRST_GUESS') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.eligibleRoundSessionId !== roundSessionId) return null;
      if (event.payload.elapsedMs === null) return null;

      return {
        internalState: {
          ...runtime.internalState,
          firstGuessElapsedMs: event.payload.elapsedMs,
          firstGuessEventId: event.eventId
        },
        reason: 'first-guesser-baseline-recorded'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;
    if (event.payload.isFirstGuesser || event.payload.position === 1) return null;
    if (event.payload.elapsedMs === null) return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (runtime.internalState.eligibleRoundSessionId !== roundSessionId) return null;
    if (runtime.internalState.firstGuessElapsedMs === null) return null;
    if (runtime.internalState.firstGuessEventId === null) return null;

    const delayMs = event.payload.elapsedMs - runtime.internalState.firstGuessElapsedMs;
    if (delayMs < 0 || delayMs > parameters.milliseconds) return null;

    const next = nextCounter(runtime.internalState);
    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: next.qualifyingEvents
      },
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-guessed-within-first-guesser-delay-window',
      evidenceEventIds: [runtime.internalState.firstGuessEventId, event.eventId]
    };
  }
};
