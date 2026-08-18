import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  getOfficialWordComponentCount,
  getOfficialWordLengthMetrics,
  getOfficialWordListStatus,
  hasOfficialWord,
  type OfficialWordListState
} from '../officialWordLists';
import { isPositiveInteger, localization } from '../shared';

export interface NeedSomeSpaceParameters {
  fallbackComponents: number;
}

export interface NeedSomeSpaceState {
  qualifyingEvents: number;
  wordListState: OfficialWordListState;
  wordListWarning: string | null;
  requiredComponents: number | null;
  matchedComponents: number | null;
  matchedWord: string | null;
}

export const needSomeSpaceDefinition: ChallengeDefinition<
  NeedSomeSpaceState,
  NeedSomeSpaceParameters
> = {
  id: 'need-some-space',
  version: 2,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Need some space?',
      'Correctly guess an official multi-word entry whose required component count is derived from the active lobby language.',
      'Need some space?',
      'Errate einen offiziellen mehrteiligen Begriff; die nötige Wortanzahl wird aus der aktiven Lobby-Sprache abgeleitet.'
    ),
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    fallbackComponents: 2
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    wordListState: 'idle',
    wordListWarning: null,
    requiredComponents: null,
    matchedComponents: null,
    matchedWord: null
  }),
  validateParameters(value): value is NeedSomeSpaceParameters {
    return typeof value === 'object' && value !== null
      && isPositiveInteger((value as Partial<NeedSomeSpaceParameters>).fallbackComponents);
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
          requiredComponents: null,
          matchedComponents: null,
          matchedWord: null
        },
        reason: 'need-some-space-official-word-list-not-ready'
      };
    }

    const requiredComponents = getOfficialWordLengthMetrics(languageId).spacedWordThreshold
      ?? parameters.fallbackComponents;
    const matchedComponents = word ? getOfficialWordComponentCount(word) : null;
    const qualifies = Boolean(
      word
      && hasOfficialWord(languageId, word)
      && matchedComponents !== null
      && matchedComponents >= requiredComponents
    );
    return {
      internalState: {
        qualifyingEvents: qualifies ? 1 : 0,
        wordListState: status.state,
        wordListWarning: null,
        requiredComponents,
        matchedComponents,
        matchedWord: word
      },
      progress: qualifies ? 1 : 0,
      complete: qualifies,
      reason: qualifies
        ? 'self-guessed-language-qualified-multi-word-entry'
        : 'word-below-language-specific-component-threshold',
      evidenceEventIds: qualifies ? [event.eventId] : []
    };
  }
};
