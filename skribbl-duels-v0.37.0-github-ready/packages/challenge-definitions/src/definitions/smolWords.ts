import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  getOfficialWordLengthMetrics,
  getOfficialWordLetterLength,
  getOfficialWordListStatus,
  hasOfficialWord,
  type OfficialWordListState
} from '../officialWordLists';
import { isPositiveInteger, localization } from '../shared';

export interface SmolWordsParameters {
  amount: number;
}

export interface SmolWordsState {
  qualifyingEvents: number;
  wordListState: OfficialWordListState;
  wordListWarning: string | null;
  threshold: number | null;
  matchedWord: string | null;
  matchedLength: number | null;
}

export const smolWordsDefinition: ChallengeDefinition<SmolWordsState, SmolWordsParameters> = {
  id: 'smol-words',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Smol words',
      'Correctly guess an official word from the shortest five percent of the active lobby language list.',
      'Smol words',
      'Errate ein offizielles Wort aus den kürzesten fünf Prozent der aktiven Lobby-Wortliste.'
    ),
    icon: 'smol-word',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: { amount: 1 },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    wordListState: 'idle',
    wordListWarning: null,
    threshold: null,
    matchedWord: null,
    matchedLength: null
  }),
  validateParameters(value): value is SmolWordsParameters {
    return typeof value === 'object' && value !== null &&
      isPositiveInteger((value as Partial<SmolWordsParameters>).amount);
  },
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS' || event.actor?.isSelf !== true) return null;

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
          matchedLength: null
        },
        reason: 'smol-words-official-word-list-not-ready',
        evidenceEventIds: [event.eventId]
      };
    }

    const threshold = getOfficialWordLengthMetrics(languageId).shortThreshold;
    if (!word || threshold === null || !hasOfficialWord(languageId, word)) {
      return {
        internalState: {
          ...runtime.internalState,
          wordListState: status.state,
          wordListWarning: null,
          threshold,
          matchedWord: null,
          matchedLength: word ? getOfficialWordLetterLength(word) : null
        },
        reason: 'smol-words-guess-not-in-ready-official-list'
      };
    }

    const length = getOfficialWordLetterLength(word);
    if (length > threshold) {
      return {
        internalState: {
          ...runtime.internalState,
          wordListState: status.state,
          wordListWarning: null,
          threshold,
          matchedWord: word,
          matchedLength: length
        },
        reason: 'smol-words-official-word-above-short-threshold'
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
        matchedLength: length
      },
      progress: qualifyingEvents,
      complete: qualifyingEvents >= parameters.amount,
      reason: 'smol-words-official-word-at-or-below-fifth-percentile',
      evidenceEventIds: [event.eventId]
    };
  }
};
