import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  getOfficialWordLengthMetrics,
  getOfficialWordLetterLength,
  getOfficialWordListStatus,
  hasOfficialWord,
  type OfficialWordListState
} from '../officialWordLists';
import { isPositiveInteger, localization } from '../shared';

export interface BigWordParameters {
  amount: number;
}

export interface BigWordState {
  qualifyingEvents: number;
  wordListState: OfficialWordListState;
  wordListWarning: string | null;
  threshold: number | null;
  matchedWord: string | null;
  matchedLength: number | null;
  requiredCount: number | null;
}

export const bigWordDefinition: ChallengeDefinition<BigWordState, BigWordParameters> = {
  id: 'big-word',
  version: 2,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Big word',
      'Be the first guesser on language-qualified long words. The required count is derived from the active official word list.',
      'Big word',
      'Errate sprachabhängig lange Wörter als Erster; die nötige Anzahl wird aus der aktiven offiziellen Wortliste abgeleitet.'
    ),
    icon: 'big-word',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: { amount: 3 },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    wordListState: 'idle',
    wordListWarning: null,
    threshold: null,
    matchedWord: null,
    matchedLength: null,
    requiredCount: null
  }),
  validateParameters(value): value is BigWordParameters {
    return typeof value === 'object' && value !== null &&
      isPositiveInteger((value as Partial<BigWordParameters>).amount);
  },
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS' || event.actor?.isSelf !== true) return null;
    if (!event.payload.isFirstGuesser && event.payload.position !== 1) return null;

    const languageId = event.context.languageId;
    const status = languageId === null
      ? null
      : getOfficialWordListStatus(languageId, event.context.languageName);
    const word = event.payload.includesWord ? event.payload.word?.trim() ?? null : null;

    if (languageId === null || !status || status.state !== 'ready') {
      return {
        internalState: {
          ...runtime.internalState,
          wordListState: status?.state ?? 'unsupported',
          wordListWarning: status?.warning ?? 'No official word list is available for the current lobby language.',
          threshold: null,
          matchedWord: null,
          matchedLength: null,
          requiredCount: null
        },
        reason: 'big-word-official-word-list-not-ready',
        evidenceEventIds: [event.eventId]
      };
    }

    const metrics = getOfficialWordLengthMetrics(languageId);
    const threshold = metrics.longThreshold;
    const requiredCount = Math.min(parameters.amount, metrics.longRequiredCount);
    if (!word || threshold === null || !hasOfficialWord(languageId, word)) {
      return {
        internalState: {
          ...runtime.internalState,
          wordListState: status.state,
          wordListWarning: null,
          threshold,
          matchedWord: null,
          matchedLength: word ? getOfficialWordLetterLength(word) : null,
          requiredCount
        },
        target: requiredCount,
        reason: 'big-word-guess-not-in-ready-official-list'
      };
    }

    const length = getOfficialWordLetterLength(word);
    if (length < threshold) {
      return {
        internalState: {
          ...runtime.internalState,
          wordListState: status.state,
          wordListWarning: null,
          threshold,
          matchedWord: word,
          matchedLength: length,
          requiredCount
        },
        target: requiredCount,
        reason: 'big-word-official-word-below-long-threshold'
      };
    }

    const qualifyingEvents = runtime.internalState.qualifyingEvents + 1;
    return {
      internalState: {
        qualifyingEvents,
        wordListState: status.state,
        wordListWarning: null,
        threshold,
        matchedWord: word,
        matchedLength: length,
        requiredCount
      },
      target: requiredCount,
      progress: qualifyingEvents,
      complete: qualifyingEvents >= requiredCount,
      reason: 'big-word-official-word-at-or-above-ninetieth-percentile',
      evidenceEventIds: [event.eventId]
    };
  }
};
