import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface AsCloseAsItGetsParameters {
  milliseconds: number;
  amount: number;
}

export interface AsCloseAsItGetsState {
  qualifyingEvents: number;
  roundSessionId: string | null;
  closeGuessEventId: string | null;
  closeGuessAtMonotonicMs: number | null;
  closeWord: string | null;
  nextGuessSubmittedEventId: string | null;
}

function clearedState(qualifyingEvents: number, roundSessionId: string | null): AsCloseAsItGetsState {
  return {
    qualifyingEvents,
    roundSessionId,
    closeGuessEventId: null,
    closeGuessAtMonotonicMs: null,
    closeWord: null,
    nextGuessSubmittedEventId: null
  };
}

export const asCloseAsItGetsDefinition: ChallengeDefinition<
  AsCloseAsItGetsState,
  AsCloseAsItGetsParameters
> = {
  id: 'as-close-as-it-gets',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'As close as it gets',
      'Guess the word within half a second after your immediately previous guess was close.',
      'As close as it gets',
      'Errate das Wort innerhalb einer halben Sekunde, nachdem dein unmittelbar vorheriger Guess close war.'
    ),
    icon: 'as-close-as-it-gets-reaction',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    milliseconds: 500,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => clearedState(0, null),
  validateParameters(value): value is AsCloseAsItGetsParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<AsCloseAsItGetsParameters>;
    return isPositiveInteger(parameters.milliseconds) && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['ROUND_STARTED', 'CLOSE_GUESS', 'GUESS_SUBMITTED', 'CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      return {
        internalState: clearedState(
          runtime.internalState.qualifyingEvents,
          event.context.roundSessionId
        ),
        reason: 'as-close-round-started'
      };
    }

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;

    if (event.type === 'CLOSE_GUESS') {
      if (!event.actor?.isSelf) return null;
      return {
        internalState: {
          qualifyingEvents: runtime.internalState.qualifyingEvents,
          roundSessionId,
          closeGuessEventId: event.eventId,
          closeGuessAtMonotonicMs: event.monotonicMs,
          closeWord: event.payload.word,
          nextGuessSubmittedEventId: null
        },
        reason: 'close-guess-baseline-recorded'
      };
    }

    if (event.type === 'GUESS_SUBMITTED') {
      if (!event.actor?.isSelf) return null;
      if (runtime.internalState.roundSessionId !== roundSessionId) return null;
      if (runtime.internalState.closeGuessEventId === null) return null;

      if (runtime.internalState.nextGuessSubmittedEventId !== null) {
        return {
          internalState: clearedState(runtime.internalState.qualifyingEvents, roundSessionId),
          reason: 'additional-guess-broke-close-chain'
        };
      }

      return {
        internalState: {
          ...runtime.internalState,
          nextGuessSubmittedEventId: event.eventId
        },
        reason: 'immediate-next-guess-submitted'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;
    if (runtime.internalState.roundSessionId !== roundSessionId) return null;
    if (runtime.internalState.closeGuessEventId === null) return null;
    if (runtime.internalState.closeGuessAtMonotonicMs === null) return null;
    if (runtime.internalState.nextGuessSubmittedEventId === null) return null;

    const delayMs = event.monotonicMs - runtime.internalState.closeGuessAtMonotonicMs;
    if (delayMs < 0 || delayMs > parameters.milliseconds) {
      return {
        internalState: clearedState(runtime.internalState.qualifyingEvents, roundSessionId),
        reason: 'correct-guess-outside-close-reaction-window'
      };
    }

    const qualifyingEvents = runtime.internalState.qualifyingEvents + 1;
    return {
      internalState: {
        ...clearedState(qualifyingEvents, roundSessionId),
        closeWord: runtime.internalState.closeWord
      },
      progress: qualifyingEvents,
      complete: qualifyingEvents >= parameters.amount,
      reason: 'correct-immediately-after-close-guess',
      evidenceEventIds: [
        runtime.internalState.closeGuessEventId,
        runtime.internalState.nextGuessSubmittedEventId,
        event.eventId
      ]
    };
  }
};
