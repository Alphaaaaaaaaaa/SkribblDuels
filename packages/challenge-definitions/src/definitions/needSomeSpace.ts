import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface NeedSomeSpaceParameters {
  amount: number;
}

function hasInternalWhitespace(word: string): boolean {
  return /\S\s+\S/u.test(word.trim());
}

export const needSomeSpaceDefinition: ChallengeDefinition<
  CounterState,
  NeedSomeSpaceParameters
> = {
  id: 'need-some-space',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Need some space?',
      'Correctly guess a word that contains at least one space.',
      'Need some space?',
      'Errate ein Wort richtig, das mindestens ein Leerzeichen enthält.'
    ),
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({ qualifyingEvents: 0 }),
  validateParameters(value): value is NeedSomeSpaceParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<NeedSomeSpaceParameters>;
    return isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;

    const word = event.payload.word?.trim();
    if (!word || !event.payload.includesWord || !hasInternalWhitespace(word)) return null;

    const next = nextCounter(runtime.internalState);
    return {
      internalState: next,
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-correctly-guessed-word-containing-space',
      evidenceEventIds: [event.eventId]
    };
  }
};
