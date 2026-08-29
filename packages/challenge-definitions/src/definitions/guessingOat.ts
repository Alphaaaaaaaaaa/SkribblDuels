import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { localization } from '../shared';

export interface GuessingOatParameters {}

export type GuessingOatTurnStatus =
  | 'none'
  | 'self-drawing'
  | 'guessing'
  | 'first-guesser-observed';

export interface GuessingOatState {
  gameSessionId: string | null;
  gameStartEventId: string | null;
  currentRoundSessionId: string | null;
  currentRoundStartEventId: string | null;
  turnStatus: GuessingOatTurnStatus;
  firstGuesserPlayerId: number | null;
  firstGuesserEventId: string | null;
  eligibleRoundSessionIds: string[];
  successfulRoundSessionIds: string[];
  interruptedRoundSessionIds: string[];
  successfulEvidenceEventIds: string[];
  failed: boolean;
}

function initialState(gameSessionId: string | null = null, gameStartEventId: string | null = null): GuessingOatState {
  return {
    gameSessionId,
    gameStartEventId,
    currentRoundSessionId: null,
    currentRoundStartEventId: null,
    turnStatus: 'none',
    firstGuesserPlayerId: null,
    firstGuesserEventId: null,
    eligibleRoundSessionIds: [],
    successfulRoundSessionIds: [],
    interruptedRoundSessionIds: [],
    successfulEvidenceEventIds: gameStartEventId === null ? [] : [gameStartEventId],
    failed: false
  };
}

function isDrawerLeft(reason: number | null, reasonName: string | null): boolean {
  return reason === 2 || reasonName === 'DRAWER_LEFT';
}

function clearCurrentTurn(state: GuessingOatState): GuessingOatState {
  return {
    ...state,
    currentRoundSessionId: null,
    currentRoundStartEventId: null,
    turnStatus: 'none',
    firstGuesserPlayerId: null,
    firstGuesserEventId: null
  };
}

export const guessingOatDefinition: ChallengeDefinition<GuessingOatState, GuessingOatParameters> = {
  id: 'guessingoat',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'GuessingOAT',
      'Be the first guesser in every regular foreign drawing turn of one fully observed public game. Your own and drawer-left turns are skipped.',
      'GuessingOAT',
      'Sei in jedem regulären fremden Zeichen-Turn eines vollständig beobachteten öffentlichen Spiels First Guesser. Eigene und durch Drawer-Abgang abgebrochene Turns werden übersprungen.'
    ),
    icon: 'guessingoat-first-guesser',
    // Deterministic replay certification is complete in v0.59.0; keep Ranked
    // closed until the same rule has passed live two-client certification.
    rankedEligible: false,
    difficulty: 5
  },
  defaultParameters: {},
  target: () => 1,
  createInitialState: () => initialState(),
  validateParameters(value): value is GuessingOatParameters {
    return typeof value === 'object' && value !== null;
  },
  relevantEvents: [
    'GAME_STARTING',
    'ROUND_STARTED',
    'FIRST_GUESS',
    'ROUND_RESULTS_AVAILABLE',
    'GAME_ENDED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime }) {
    if (event.type === 'GAME_STARTING') {
      const gameSessionId = event.context.gameSessionId;
      if (gameSessionId === null) {
        return {
          internalState: initialState(),
          progress: 0,
          reason: 'guessingoat-game-start-missing-session-id'
        };
      }
      return {
        internalState: initialState(gameSessionId, event.eventId),
        progress: 0,
        reason: 'guessingoat-full-game-observation-started',
        evidenceEventIds: [event.eventId]
      };
    }

    const state = runtime.internalState;
    if (state.gameSessionId === null || event.context.gameSessionId !== state.gameSessionId) return null;

    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      const duplicate = roundSessionId !== null && (
        state.currentRoundSessionId === roundSessionId
        || state.eligibleRoundSessionIds.includes(roundSessionId)
        || state.interruptedRoundSessionIds.includes(roundSessionId)
      );
      if (duplicate) return null;
      const unresolvedPreviousTurn = state.currentRoundSessionId !== null;
      const selfPlayerId = event.context.meId;
      const drawerId = event.context.drawerId;
      if (roundSessionId === null || selfPlayerId === null || drawerId === null) {
        return {
          internalState: {
            ...clearCurrentTurn(state),
            failed: true
          },
          progress: 0,
          reason: 'guessingoat-round-start-missing-authoritative-context',
          evidenceEventIds: [event.eventId]
        };
      }
      const selfDrawing = drawerId === selfPlayerId;
      return {
        internalState: {
          ...state,
          currentRoundSessionId: roundSessionId,
          currentRoundStartEventId: event.eventId,
          turnStatus: selfDrawing ? 'self-drawing' : 'guessing',
          firstGuesserPlayerId: null,
          firstGuesserEventId: null,
          failed: state.failed || unresolvedPreviousTurn
        },
        progress: 0,
        reason: unresolvedPreviousTurn
          ? 'guessingoat-unsettled-turn-before-next-turn-failed-game'
          : selfDrawing
            ? 'guessingoat-self-drawing-turn-skipped'
            : 'guessingoat-eligible-foreign-turn-started',
        ...(unresolvedPreviousTurn ? { evidenceEventIds: [event.eventId] } : {})
      };
    }

    if (event.type === 'FIRST_GUESS') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null
          || state.currentRoundSessionId !== roundSessionId
          || state.turnStatus !== 'guessing') return null;
      const playerId = event.actor?.playerId ?? event.payload.playerId;
      if (!Number.isInteger(playerId)) {
        return {
          internalState: { ...state, failed: true },
          progress: 0,
          reason: 'guessingoat-first-guesser-missing-player-id',
          evidenceEventIds: [event.eventId]
        };
      }
      return {
        internalState: {
          ...state,
          turnStatus: 'first-guesser-observed',
          firstGuesserPlayerId: playerId,
          firstGuesserEventId: event.eventId
        },
        progress: 0,
        reason: playerId === event.context.meId
          ? 'guessingoat-self-first-guesser-observed'
          : 'guessingoat-other-first-guesser-observed',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'ROUND_RESULTS_AVAILABLE') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) {
        return {
          internalState: { ...state, failed: true },
          progress: 0,
          reason: 'guessingoat-round-results-missing-session-id',
          evidenceEventIds: [event.eventId]
        };
      }
      if (state.eligibleRoundSessionIds.includes(roundSessionId)
          || state.interruptedRoundSessionIds.includes(roundSessionId)) return null;
      if (state.currentRoundSessionId !== roundSessionId) {
        return {
          internalState: { ...state, failed: true },
          progress: 0,
          reason: 'guessingoat-unobserved-round-results-failed-game',
          evidenceEventIds: [event.eventId]
        };
      }

      if (state.turnStatus === 'self-drawing') {
        return {
          internalState: clearCurrentTurn(state),
          progress: 0,
          reason: 'guessingoat-self-drawing-turn-settled'
        };
      }
      if (isDrawerLeft(event.payload.reason, event.payload.reasonName)) {
        return {
          internalState: {
            ...clearCurrentTurn(state),
            interruptedRoundSessionIds: [...state.interruptedRoundSessionIds, roundSessionId]
          },
          progress: 0,
          reason: 'guessingoat-drawer-left-turn-skipped',
          evidenceEventIds: [event.eventId]
        };
      }

      const selfPlayerId = event.context.meId;
      const succeeded = selfPlayerId !== null && state.firstGuesserPlayerId === selfPlayerId;
      const eligibleRoundSessionIds = [...state.eligibleRoundSessionIds, roundSessionId];
      const successfulRoundSessionIds = succeeded
        ? [...state.successfulRoundSessionIds, roundSessionId]
        : state.successfulRoundSessionIds;
      const successfulEvidenceEventIds = succeeded
        ? [
            ...state.successfulEvidenceEventIds,
            ...(state.currentRoundStartEventId ? [state.currentRoundStartEventId] : []),
            ...(state.firstGuesserEventId ? [state.firstGuesserEventId] : []),
            event.eventId
          ]
        : state.successfulEvidenceEventIds;
      return {
        internalState: {
          ...clearCurrentTurn(state),
          eligibleRoundSessionIds,
          successfulRoundSessionIds,
          successfulEvidenceEventIds,
          failed: state.failed || !succeeded
        },
        progress: 0,
        reason: succeeded
          ? 'guessingoat-self-was-first-guesser-in-regular-turn'
          : state.firstGuesserPlayerId === null
            ? 'guessingoat-regular-turn-ended-without-first-guess'
            : 'guessingoat-other-player-was-first-guesser',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'GAME_ENDED') return null;
    const complete = !state.failed
      && state.currentRoundSessionId === null
      && state.eligibleRoundSessionIds.length > 0
      && state.successfulRoundSessionIds.length === state.eligibleRoundSessionIds.length;
    return {
      internalState: state,
      progress: complete ? 1 : 0,
      complete,
      reason: complete
        ? 'guessingoat-first-guesser-in-every-regular-foreign-turn-of-full-game'
        : state.currentRoundSessionId !== null
          ? 'guessingoat-game-ended-with-unsettled-turn'
          : state.eligibleRoundSessionIds.length === 0
            ? 'guessingoat-game-ended-without-eligible-foreign-turns'
            : 'guessingoat-game-contained-missed-or-lost-first-guess',
      evidenceEventIds: complete
        ? [...state.successfulEvidenceEventIds, event.eventId]
        : [event.eventId]
    };
  }
};
