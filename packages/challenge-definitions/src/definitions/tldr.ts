import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  countVisibleCharacters,
  isPositiveInteger,
  localization,
  nextCounter,
  type CounterState
} from '../shared';
import { hasOfficialWord } from '../officialWordLists';
import {
  getProseDictionaryLocale,
  isRecognizedProseWord,
  normalizeProseWord
} from '../proseDictionary';

export interface TldrParameters {
  minimumCharacters: number;
  minimumWords: number;
  minimumRecognizedRatio: number;
  maximumRepeatedWordRatio: number;
  amount: number;
}

export interface TldrState extends CounterState {
  longestMessageLength: number;
  highestWordCount: number;
  highestRecognizedRatio: number;
}

export interface TldrMessageEvaluation {
  visibleCharacters: number;
  words: string[];
  recognizedWords: number;
  recognizedRatio: number;
  maximumRepeatedWordRatio: number;
  qualifies: boolean;
  reason:
    | 'language-unavailable'
    | 'below-character-threshold'
    | 'below-word-threshold'
    | 'too-many-repeated-words'
    | 'below-recognized-ratio'
    | 'qualified-prose';
}

function isRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function stripNonProse(value: string): string {
  return value
    .replace(/\b(?:https?:\/\/|www\.)\S+/giu, ' ')
    .replace(/(?:^|\s)@[\p{L}\p{M}\p{N}_-]+/gu, ' ');
}

function extractWords(value: string, locale: string): string[] {
  const prose = stripNonProse(value);
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    return [...segmenter.segment(prose)]
      .filter(segment => segment.isWordLike)
      .map(segment => normalizeProseWord(segment.segment))
      .filter(word => /\p{L}/u.test(word));
  } catch {
    return [...prose.matchAll(/[\p{L}\p{M}]+(?:['’‘-][\p{L}\p{M}]+)*/gu)]
      .map(match => normalizeProseWord(match[0]))
      .filter(Boolean);
  }
}

export function evaluateTldrMessage(
  message: string,
  languageId: number | null,
  parameters: Readonly<TldrParameters>
): TldrMessageEvaluation {
  const visibleCharacters = countVisibleCharacters(message);
  const locale = getProseDictionaryLocale(languageId);
  if (locale === null) {
    return {
      visibleCharacters,
      words: [],
      recognizedWords: 0,
      recognizedRatio: 0,
      maximumRepeatedWordRatio: 0,
      qualifies: false,
      reason: 'language-unavailable'
    };
  }

  const words = extractWords(message, locale);
  let recognizedWords = 0;
  const occurrences = new Map<string, number>();
  for (const word of words) {
    const nextOccurrence = (occurrences.get(word) ?? 0) + 1;
    occurrences.set(word, nextOccurrence);
    if (
      isRecognizedProseWord(languageId, word)
      || hasOfficialWord(languageId, word)
    ) {
      recognizedWords += 1;
    }
  }
  const recognizedRatio = words.length === 0 ? 0 : recognizedWords / words.length;
  const maximumRepeatedWordRatio = words.length === 0
    ? 0
    : Math.max(...occurrences.values()) / words.length;

  let reason: TldrMessageEvaluation['reason'] = 'qualified-prose';
  if (visibleCharacters < parameters.minimumCharacters) reason = 'below-character-threshold';
  else if (words.length < parameters.minimumWords) reason = 'below-word-threshold';
  else if (maximumRepeatedWordRatio > parameters.maximumRepeatedWordRatio) {
    reason = 'too-many-repeated-words';
  } else if (
    recognizedWords < Math.max(1, Math.floor(words.length * parameters.minimumRecognizedRatio))
  ) {
    reason = 'below-recognized-ratio';
  }

  return {
    visibleCharacters,
    words,
    recognizedWords,
    recognizedRatio,
    maximumRepeatedWordRatio,
    qualifies: reason === 'qualified-prose',
    reason
  };
}

export const tldrDefinition: ChallengeDefinition<TldrState, TldrParameters> = {
  id: 'tldr',
  version: 2,
  metadata: {
    category: 'chat',
    localization: localization(
      'TL;DR',
      'Send a genuine 50-character message with roughly 90% recognized words.',
      'TL;DR',
      'Sende eine echte Nachricht mit 50 Zeichen und ungefähr 90 % erkannten Wörtern.'
    ),
    icon: 'tldr-prose',
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    minimumCharacters: 50,
    minimumWords: 8,
    minimumRecognizedRatio: 0.9,
    maximumRepeatedWordRatio: 0.4,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    longestMessageLength: 0,
    highestWordCount: 0,
    highestRecognizedRatio: 0
  }),
  validateParameters(value): value is TldrParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<TldrParameters>;
    return isPositiveInteger(parameters.minimumCharacters)
      && isPositiveInteger(parameters.minimumWords)
      && isRatio(parameters.minimumRecognizedRatio)
      && isRatio(parameters.maximumRepeatedWordRatio)
      && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['TEXT_SUBMITTED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'TEXT_SUBMITTED') return null;
    if (!event.actor?.isSelf) return null;
    if (event.payload.message === null) return null;

    const evaluation = evaluateTldrMessage(
      event.payload.message,
      event.context.languageId,
      parameters
    );
    const longestMessageLength = Math.max(
      runtime.internalState.longestMessageLength,
      evaluation.visibleCharacters
    );
    const highestWordCount = Math.max(runtime.internalState.highestWordCount, evaluation.words.length);
    const highestRecognizedRatio = Math.max(
      runtime.internalState.highestRecognizedRatio,
      evaluation.recognizedRatio
    );

    if (!evaluation.qualifies) {
      if (
        longestMessageLength === runtime.internalState.longestMessageLength
        && highestWordCount === runtime.internalState.highestWordCount
        && highestRecognizedRatio === runtime.internalState.highestRecognizedRatio
      ) return null;
      return {
        internalState: {
          ...runtime.internalState,
          longestMessageLength,
          highestWordCount,
          highestRecognizedRatio
        },
        reason: `tldr-${evaluation.reason}`
      };
    }

    const next = nextCounter(runtime.internalState);
    return {
      internalState: {
        qualifyingEvents: next.qualifyingEvents,
        longestMessageLength,
        highestWordCount,
        highestRecognizedRatio
      },
      progress: next.qualifyingEvents,
      complete: next.qualifyingEvents >= parameters.amount,
      reason: 'self-submitted-recognized-prose-message',
      evidenceEventIds: [event.eventId]
    };
  }
};
