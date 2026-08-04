import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface MyEyesAreBleedingParameters {
  amount: number;
  keywords: string[];
}

export interface MyEyesAreBleedingState {
  qualifyingEvents: number;
  matchedKeyword: string | null;
  matchedMessage: string | null;
  matchedPlayerId: number | null;
}

const DEFAULT_INSULT_KEYWORDS = [
  'idiot',
  'dumm',
  'dummkopf',
  'arschloch',
  'hurensohn',
  'wichser',
  'bastard',
  'spast',
  'mongo',
  'opfer',
  'missgeburt',
  'moron',
  'stupid',
  'dumb',
  'dumbass',
  'asshole',
  'loser',
  'bitch',
  'fucker'
] as const;

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function findKeyword(message: string, keywords: readonly string[]): string | null {
  const normalizedMessage = ` ${normalizeText(message)} `;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalizedKeyword.length === 0) continue;
    if (normalizedMessage.includes(` ${normalizedKeyword} `)) return keyword;
  }
  return null;
}

export const myEyesAreBleedingDefinition: ChallengeDefinition<
  MyEyesAreBleedingState,
  MyEyesAreBleedingParameters
> = {
  id: 'my-eyes-are-bleeding',
  version: 1,
  metadata: {
    category: 'chat',
    localization: localization(
      'My eyes are bleeding',
      'See another player use an insult keyword in public chat.',
      'My eyes are bleeding',
      'Erlebe, dass ein anderer Spieler im öffentlichen Chat ein Beleidigungswort verwendet.'
    ),
    icon: 'my-eyes-are-bleeding-chat',
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    amount: 1,
    keywords: [...DEFAULT_INSULT_KEYWORDS]
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    matchedKeyword: null,
    matchedMessage: null,
    matchedPlayerId: null
  }),
  validateParameters(value): value is MyEyesAreBleedingParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<MyEyesAreBleedingParameters>;
    return isPositiveInteger(parameters.amount) &&
      Array.isArray(parameters.keywords) &&
      parameters.keywords.length > 0 &&
      parameters.keywords.every(keyword => typeof keyword === 'string' && keyword.trim().length > 0);
  },
  relevantEvents: ['CHAT_MESSAGE_RECEIVED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CHAT_MESSAGE_RECEIVED') return null;
    if (event.actor?.isSelf || event.payload.message === null) return null;

    const matchedKeyword = findKeyword(event.payload.message, parameters.keywords);
    if (matchedKeyword === null) return null;

    const qualifyingEvents = runtime.internalState.qualifyingEvents + 1;
    return {
      internalState: {
        qualifyingEvents,
        matchedKeyword,
        matchedMessage: event.payload.message,
        matchedPlayerId: event.payload.playerId ?? event.actor?.playerId ?? null
      },
      progress: qualifyingEvents,
      complete: qualifyingEvents >= parameters.amount,
      reason: 'other-player-used-insult-keyword',
      evidenceEventIds: [event.eventId]
    };
  }
};
