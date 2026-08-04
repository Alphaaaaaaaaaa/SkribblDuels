import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  getOfficialWordLetterLength,
  getOfficialWordListStatus,
  hasOfficialWord,
  type OfficialWordListState
} from '../officialWordLists';
import { isPositiveInteger, localization } from '../shared';

export interface SpamguessingParameters {
  minimumAttempts: number;
  burstWindowMs: number;
}

interface SpamAttempt {
  eventId: string;
  message: string;
  monotonicMs: number;
  official: boolean;
  matchingLength: boolean;
  qualifying: boolean;
}

export interface SpamguessingState {
  roundSessionId: string | null;
  targetLetterLength: number | null;
  attempts: SpamAttempt[];
  wordListState: OfficialWordListState;
  wordListWarning: string | null;
}

function totalWordLength(wordLengths: readonly number[] | null): number | null {
  if (!wordLengths || wordLengths.length === 0) return null;
  if (!wordLengths.every(length => Number.isInteger(length) && length > 0)) return null;
  return wordLengths.reduce((sum, length) => sum + length, 0);
}

export const spamguessingDefinition: ChallengeDefinition<
  SpamguessingState,
  SpamguessingParameters
> = {
  id: 'spamguessing',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Spamguessing',
      'Trigger Skribbl spam detection with a rapid burst of valid official guesses matching the target word length.',
      'Spamguessing',
      'Löse den Skribbl-Spamschutz mit einer schnellen Folge gültiger offizieller Rateversuche aus, deren Wortlänge zum gesuchten Wort passt.'
    ),
    icon: 'spamguessing-burst',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    minimumAttempts: 3,
    burstWindowMs: 2500
  },
  target: () => 1,
  createInitialState: () => ({
    roundSessionId: null,
    targetLetterLength: null,
    attempts: [],
    wordListState: 'idle',
    wordListWarning: null
  }),
  validateParameters(value): value is SpamguessingParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<SpamguessingParameters>;
    return isPositiveInteger(parameters.minimumAttempts) && isPositiveInteger(parameters.burstWindowMs);
  },
  relevantEvents: ['ROUND_STARTED', 'GUESS_SUBMITTED', 'SPAM_DETECTED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change', 'round-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const status = event.context.languageId === null
        ? null
        : getOfficialWordListStatus(event.context.languageId, event.context.languageName);
      const drawerId = event.context.drawerId ?? event.payload.drawerId;
      const eligible = event.context.meId !== null && drawerId !== null && drawerId !== event.context.meId;
      return {
        internalState: {
          roundSessionId: eligible ? event.context.roundSessionId : null,
          targetLetterLength: eligible ? totalWordLength(event.payload.wordLengths) : null,
          attempts: [],
          wordListState: status?.state ?? 'unsupported',
          wordListWarning: status?.warning ?? 'No official word list is available for the current lobby language.'
        },
        progress: 0,
        reason: eligible ? 'spamguessing-foreign-round-started' : 'spamguessing-round-ineligible'
      };
    }

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null || roundSessionId !== runtime.internalState.roundSessionId) return null;

    if (event.type === 'GUESS_SUBMITTED') {
      if (!event.actor?.isSelf || event.payload.message === null) return null;
      const status = event.context.languageId === null
        ? null
        : getOfficialWordListStatus(event.context.languageId, event.context.languageName);
      const targetLength = runtime.internalState.targetLetterLength;
      const official = status?.state === 'ready' && hasOfficialWord(event.context.languageId, event.payload.message);
      const matchingLength = targetLength !== null && getOfficialWordLetterLength(event.payload.message) === targetLength;
      const previous = runtime.internalState.attempts.at(-1);
      const continuesBurst = previous !== undefined && event.monotonicMs - previous.monotonicMs <= parameters.burstWindowMs;
      const attempts = (continuesBurst ? runtime.internalState.attempts : []).concat({
        eventId: event.eventId,
        message: event.payload.message,
        monotonicMs: event.monotonicMs,
        official,
        matchingLength,
        qualifying: official && matchingLength
      }).slice(-16);
      return {
        internalState: {
          ...runtime.internalState,
          attempts,
          wordListState: status?.state ?? 'unsupported',
          wordListWarning: status?.warning ?? (status?.state === 'ready' ? null : 'No official word list is available for the current lobby language.')
        },
        progress: 0,
        reason: official && matchingLength
          ? 'spamguessing-valid-attempt-recorded'
          : official
            ? 'spamguessing-attempt-wrong-length'
            : 'spamguessing-attempt-not-official'
      };
    }

    if (event.type !== 'SPAM_DETECTED' || !event.actor?.isSelf) return null;
    const attempts = runtime.internalState.attempts.filter(attempt =>
      event.monotonicMs >= attempt.monotonicMs &&
      event.monotonicMs - attempt.monotonicMs <= parameters.burstWindowMs
    );
    const allQualifying = attempts.length >= parameters.minimumAttempts && attempts.every(attempt => attempt.qualifying);
    if (!allQualifying) {
      return {
        internalState: {
          ...runtime.internalState,
          attempts: []
        },
        progress: 0,
        reason: 'spam-detected-without-valid-length-matched-official-burst',
        evidenceEventIds: [event.eventId]
      };
    }

    return {
      internalState: {
        ...runtime.internalState,
        attempts
      },
      progress: 1,
      complete: true,
      reason: 'spam-detected-after-valid-official-guess-burst',
      evidenceEventIds: [...attempts.map(attempt => attempt.eventId), event.eventId]
    };
  }
};
