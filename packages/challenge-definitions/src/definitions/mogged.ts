import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  getOfficialWordListStatus,
  hasOfficialWord,
  normalizeOfficialWord,
  type OfficialWordListState
} from '../officialWordLists';
import { isFinitePositiveNumber, localization } from '../shared';

export interface MoggedParameters {
  players: number;
}

interface CandidateAttempt {
  playerId: number;
  messages: string[];
  eventIds: string[];
}

export interface MoggedState {
  qualifyingEvents: number;
  roundSessionId: string | null;
  drawerId: number | null;
  attempts: CandidateAttempt[];
  qualifiedPlayerIds: number[];
  wordListState: OfficialWordListState;
  wordListWarning: string | null;
}

function addAttempt(
  attempts: CandidateAttempt[],
  playerId: number,
  message: string,
  eventId: string
): CandidateAttempt[] {
  const normalized = normalizeOfficialWord(message);
  const existing = attempts.find(attempt => attempt.playerId === playerId);
  if (!existing) {
    return [...attempts, { playerId, messages: [normalized], eventIds: [eventId] }];
  }
  if (existing.messages.includes(normalized)) return attempts;
  return attempts.map(attempt => attempt.playerId === playerId
    ? {
      ...attempt,
      messages: [...attempt.messages, normalized].slice(-12),
      eventIds: [...attempt.eventIds, eventId].slice(-12)
    }
    : attempt);
}

export const moggedDefinition: ChallengeDefinition<MoggedState, MoggedParameters> = {
  id: 'mogged',
  version: 4,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Mogged',
      'Be the first guesser after at least three different players submitted a wrong word from the official lobby word list.',
      'Mogged',
      'Errate das Wort als Erster, nachdem mindestens drei verschiedene Spieler zuvor ein falsches Wort aus der offiziellen Wortliste der Lobby eingegeben haben.'
    ),
    icon: 'mogged-crowd',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: { players: 3 },
  target: parameters => parameters.players,
  createInitialState: () => ({
    qualifyingEvents: 0,
    roundSessionId: null,
    drawerId: null,
    attempts: [],
    qualifiedPlayerIds: [],
    wordListState: 'idle',
    wordListWarning: null
  }),
  validateParameters(value): value is MoggedParameters {
    return typeof value === 'object' && value !== null &&
      isFinitePositiveNumber((value as Partial<MoggedParameters>).players);
  },
  relevantEvents: ['ROUND_STARTED', 'CHAT_MESSAGE_RECEIVED', 'CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change', 'round-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const status = event.context.languageId === null
        ? null
        : getOfficialWordListStatus(event.context.languageId, event.context.languageName);
      return {
        internalState: {
          qualifyingEvents: 0,
          roundSessionId: event.context.roundSessionId,
          drawerId: event.context.drawerId,
          attempts: [],
          qualifiedPlayerIds: [],
          wordListState: status?.state ?? 'unsupported',
          wordListWarning: status?.warning ?? 'No official word list is available for the current lobby language.'
        },
        progress: 0,
        reason: 'mogged-turn-started',
        evidenceEventIds: [event.eventId]
      };
    }

    if (!runtime.internalState.roundSessionId ||
        event.context.roundSessionId !== runtime.internalState.roundSessionId) return null;

    if (event.type === 'CHAT_MESSAGE_RECEIVED') {
      const playerId = event.payload.playerId ?? event.actor?.playerId ?? null;
      const message = event.payload.message;
      if (playerId === null || message === null ||
          playerId === event.context.meId || playerId === runtime.internalState.drawerId) return null;
      return {
        internalState: {
          ...runtime.internalState,
          attempts: addAttempt(runtime.internalState.attempts, playerId, message, event.eventId)
        },
        reason: 'mogged-observed-candidate-attempt'
      };
    }

    if (event.type !== 'CORRECT_GUESS' || event.actor?.isSelf !== true) return null;
    if (!event.payload.isFirstGuesser && event.payload.position !== 1) return null;

    const status = event.context.languageId === null
      ? null
      : getOfficialWordListStatus(event.context.languageId, event.context.languageName);
    if (!status || status.state !== 'ready') {
      return {
        internalState: {
          ...runtime.internalState,
          qualifyingEvents: 0,
          qualifiedPlayerIds: [],
          wordListState: status?.state ?? 'unsupported',
          wordListWarning: status?.warning ?? 'No official word list is available for the current lobby language.'
        },
        progress: 0,
        reason: 'mogged-official-word-list-not-ready',
        evidenceEventIds: [event.eventId]
      };
    }

    const qualified = runtime.internalState.attempts.filter(attempt =>
      attempt.messages.some(message => hasOfficialWord(event.context.languageId, message))
    ).slice(0, parameters.players);
    const qualifiedPlayerIds = qualified.map(attempt => attempt.playerId);
    const progress = Math.min(qualifiedPlayerIds.length, parameters.players);
    const evidence = qualified.flatMap(attempt => attempt.eventIds).concat(event.eventId);

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: progress,
        qualifiedPlayerIds,
        wordListState: status.state,
        wordListWarning: null
      },
      progress,
      complete: progress >= parameters.players,
      reason: progress >= parameters.players
        ? 'mogged-target-official-wrong-word-players-before-self-guess'
        : 'mogged-not-enough-qualified-players',
      evidenceEventIds: evidence
    };
  }
};
