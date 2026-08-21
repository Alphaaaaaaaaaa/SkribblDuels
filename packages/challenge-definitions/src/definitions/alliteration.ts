import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';

export interface AlliterationParameters {
  amount: number;
}

function firstNormalizedLetter(value: string): string | null {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en-US');
  return normalized.match(/\p{L}/u)?.[0] ?? null;
}

export const alliterationDefinition: ChallengeDefinition<
  CounterState,
  AlliterationParameters
> = {
  id: 'alliteration',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Alliteration',
      'Correctly guess a word that starts with the same letter as your player name.',
      'Alliteration',
      'Errate ein Wort richtig, das mit demselben Buchstaben wie dein Spielername beginnt.'
    ),
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({ qualifyingEvents: 0 }),
  validateParameters(value): value is AlliterationParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<AlliterationParameters>;
    return isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;

    const nameInitial = firstNormalizedLetter(event.actor.name ?? '');
    const wordInitial = firstNormalizedLetter(event.payload.word ?? '');
    if (!event.payload.includesWord || nameInitial === null || wordInitial === null) return null;
    if (nameInitial !== wordInitial) return null;

    const next = nextCounter(runtime.internalState);
    return {
      internalState: next,
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-name-and-guessed-word-share-first-letter',
      evidenceEventIds: [event.eventId]
    };
  }
};
