import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { localization } from '../shared';

export interface SolitaryState {
  qualifyingEvents: number;
  currentRoundSessionId: string | null;
  roundStartEventId: string | null;
  selfPlayerId: number | null;
  drawerId: number | null;
  foreignDrawingActive: boolean;
  interrupted: boolean;
  guessedPlayerIds: number[];
  guessEvidenceEventIds: string[];
}

export interface SolitaryParameters {}

function emptyState(): SolitaryState {
  return {
    qualifyingEvents: 0,
    currentRoundSessionId: null,
    roundStartEventId: null,
    selfPlayerId: null,
    drawerId: null,
    foreignDrawingActive: false,
    interrupted: false,
    guessedPlayerIds: [],
    guessEvidenceEventIds: []
  };
}

export const solitaryDefinition: ChallengeDefinition<SolitaryState, SolitaryParameters> = {
  id: 'solitary',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Solitary',
      'Be the only player who correctly guesses a word in a fully observed public drawing turn.',
      'Solitary',
      'Sei in einem vollständig beobachteten öffentlichen Zeichen-Turn der einzige Spieler, der das Wort richtig errät.'
    ),
    icon: 'solitary-only-guesser',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {},
  target: () => 1,
  createInitialState: emptyState,
  validateParameters(value): value is SolitaryParameters {
    return typeof value === 'object' && value !== null;
  },
  relevantEvents: ['ROUND_STARTED', 'CORRECT_GUESS', 'PLAYER_LEFT', 'ROUND_ENDED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      const selfPlayerId = event.context.meId;
      const drawerId = event.context.drawerId;
      if (roundSessionId === null || selfPlayerId === null || drawerId === null) return null;
      const foreignDrawingActive = drawerId !== selfPlayerId;
      return {
        internalState: {
          ...emptyState(),
          currentRoundSessionId: roundSessionId,
          roundStartEventId: event.eventId,
          selfPlayerId,
          drawerId,
          foreignDrawingActive
        },
        progress: 0,
        reason: foreignDrawingActive
          ? 'solitary-foreign-drawing-started'
          : 'solitary-own-drawing-skipped'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      if (!runtime.internalState.foreignDrawingActive || !event.payload.wasDrawer) return null;
      if (runtime.internalState.drawerId !== event.payload.playerId) return null;
      return {
        internalState: {
          ...runtime.internalState,
          interrupted: true
        },
        progress: 0,
        reason: 'solitary-drawer-left-turn-interrupted',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'CORRECT_GUESS') {
      const state = runtime.internalState;
      if (!state.foreignDrawingActive || state.interrupted) return null;
      if (event.context.roundSessionId === null || event.context.roundSessionId !== state.currentRoundSessionId) return null;
      const playerId = event.actor?.playerId ?? event.payload.playerId;
      if (!Number.isInteger(playerId) || state.guessedPlayerIds.includes(playerId)) return null;
      return {
        internalState: {
          ...state,
          guessedPlayerIds: [...state.guessedPlayerIds, playerId],
          guessEvidenceEventIds: [...state.guessEvidenceEventIds, event.eventId]
        },
        progress: 0,
        reason: playerId === state.selfPlayerId
          ? 'solitary-self-guessed'
          : 'solitary-another-player-guessed',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'ROUND_ENDED') return null;
    const state = runtime.internalState;
    if (!state.foreignDrawingActive) return null;
    if (event.context.roundSessionId === null || event.context.roundSessionId !== state.currentRoundSessionId) return null;
    const qualifies =
      !state.interrupted &&
      state.selfPlayerId !== null &&
      state.guessedPlayerIds.length === 1 &&
      state.guessedPlayerIds[0] === state.selfPlayerId;
    const evidenceEventIds = [
      ...(state.roundStartEventId ? [state.roundStartEventId] : []),
      ...state.guessEvidenceEventIds,
      event.eventId
    ];
    return {
      internalState: {
        ...emptyState(),
        qualifyingEvents: qualifies ? 1 : 0
      },
      progress: qualifies ? 1 : 0,
      complete: qualifies,
      reason: qualifies
        ? 'solitary-self-was-only-correct-guesser-at-round-end'
        : state.interrupted
          ? 'solitary-interrupted-turn-ended'
          : 'solitary-round-ended-without-exclusive-self-guess',
      evidenceEventIds
    };
  }
};
