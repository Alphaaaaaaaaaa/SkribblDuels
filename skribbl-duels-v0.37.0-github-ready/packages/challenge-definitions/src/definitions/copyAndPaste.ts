import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, isPositiveInteger, localization } from '../shared';

export interface CopyAndPasteParameters {
  guessers: number;
  seconds: number;
}

export interface CopyAndPasteGuess {
  playerId: number;
  eventId: string;
  elapsedMs: number;
}

export interface CopyAndPasteState {
  qualifyingEvents: number;
  currentRoundSessionId: string | null;
  roundStartEventId: string | null;
  ownDrawingActive: boolean;
  guesses: CopyAndPasteGuess[];
}

export const copyAndPasteDefinition: ChallengeDefinition<
  CopyAndPasteState,
  CopyAndPasteParameters
> = {
  id: 'copy-and-paste',
  version: 2,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Copy + Paste',
      'Have at least 3 different players guess your drawing correctly within the first 10 seconds after the drawing turn begins in a public lobby.',
      'Copy + Paste',
      'Lasse mindestens 3 verschiedene Spieler deine Zeichnung innerhalb der ersten 10 Sekunden nach Beginn des Zeichen-Turns richtig erraten.'
    ),
    icon: 'copy-and-paste',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    guessers: 3,
    seconds: 10
  },
  target: parameters => parameters.guessers,
  createInitialState: () => ({
    qualifyingEvents: 0,
    currentRoundSessionId: null,
    roundStartEventId: null,
    ownDrawingActive: false,
    guesses: []
  }),
  validateParameters(value): value is CopyAndPasteParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<CopyAndPasteParameters>;
    return isPositiveInteger(parameters.guessers) && isFinitePositiveNumber(parameters.seconds);
  },
  relevantEvents: ['ROUND_STARTED', 'CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      const ownDrawingActive = event.context.meId !== null && event.context.drawerId === event.context.meId;

      return {
        internalState: {
          qualifyingEvents: 0,
          currentRoundSessionId: roundSessionId,
          roundStartEventId: event.eventId,
          ownDrawingActive,
          guesses: []
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'copy-and-paste-own-drawing-started'
          : 'copy-and-paste-foreign-drawing-started'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (!runtime.internalState.ownDrawingActive) return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null || runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return null;
    if (event.actor?.isSelf) return null;

    const elapsedMs = event.payload.elapsedMs;
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
    if (elapsedMs > parameters.seconds * 1000) return null;

    const playerId = event.actor?.playerId ?? event.payload.playerId;
    if (typeof playerId !== 'number' || !Number.isInteger(playerId)) return null;
    if (runtime.internalState.guesses.some(guess => guess.playerId === playerId)) return null;

    const guesses = [
      ...runtime.internalState.guesses,
      { playerId, eventId: event.eventId, elapsedMs }
    ];
    const progress = guesses.length;
    const evidenceEventIds = [
      ...(runtime.internalState.roundStartEventId ? [runtime.internalState.roundStartEventId] : []),
      ...guesses.map(guess => guess.eventId)
    ];

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: progress,
        guesses
      },
      progress,
      complete: progress >= parameters.guessers,
      reason: 'copy-and-paste-correct-guesser-within-opening-window',
      evidenceEventIds
    };
  }
};
