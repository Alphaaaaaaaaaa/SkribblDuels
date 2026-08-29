import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { localization } from '../shared';

export interface AteAndLeftNoCrumbsParameters {}

export interface AteAndLeftNoCrumbsState {
  gameSessionId: string | null;
  gameStartEventId: string | null;
  currentRoundSessionId: string | null;
  currentRoundStartEventId: string | null;
  eligibleRoundSessionIds: string[];
  successfulRoundSessionIds: string[];
  interruptedRoundSessionIds: string[];
  successfulEvidenceEventIds: string[];
  failed: boolean;
}

function initialState(gameSessionId: string | null = null, gameStartEventId: string | null = null): AteAndLeftNoCrumbsState {
  return {
    gameSessionId,
    gameStartEventId,
    currentRoundSessionId: null,
    currentRoundStartEventId: null,
    eligibleRoundSessionIds: [],
    successfulRoundSessionIds: [],
    interruptedRoundSessionIds: [],
    successfulEvidenceEventIds: gameStartEventId === null ? [] : [gameStartEventId],
    failed: false
  };
}

function sameObservedGame(state: AteAndLeftNoCrumbsState, gameSessionId: string | null): boolean {
  return state.gameSessionId !== null && gameSessionId === state.gameSessionId;
}

function isDrawerLeft(reason: number | null, reasonName: string | null): boolean {
  return reason === 2 || reasonName === 'DRAWER_LEFT';
}

export const ateAndLeftNoCrumbsDefinition: ChallengeDefinition<
  AteAndLeftNoCrumbsState,
  AteAndLeftNoCrumbsParameters
> = {
  id: 'ate-and-left-no-crumbs',
  version: 2,
  metadata: {
    category: 'progress',
    localization: localization(
      'Ate and left no crumbs',
      'Earn positive points in every regular drawing turn of one fully observed public game. Turns interrupted by the drawer leaving are skipped.',
      'Ate and left no crumbs',
      'Erhalte in jedem regulären Zeichen-Turn eines vollständig beobachteten öffentlichen Spiels positive Punkte. Durch den Abgang des Drawers abgebrochene Turns werden übersprungen.'
    ),
    icon: 'ate-and-left-no-crumbs-score',
    // The deterministic reducer is fixture-certified. Ranked remains closed
    // until the new rule has also passed live two-client certification.
    rankedEligible: false,
    difficulty: 5
  },
  defaultParameters: {},
  target: () => 1,
  createInitialState: () => initialState(),
  validateParameters(value): value is AteAndLeftNoCrumbsParameters {
    return typeof value === 'object' && value !== null;
  },
  relevantEvents: [
    'GAME_STARTING',
    'ROUND_ANNOUNCED',
    'ROUND_STARTED',
    'ROUND_RESULTS_AVAILABLE',
    'GAME_ENDED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime }) {
    const automaticRestartObserved = event.type === 'ROUND_ANNOUNCED'
      && event.payload.previousStateId === 6
      && event.payload.stateId === 2;
    if (event.type === 'GAME_STARTING' || automaticRestartObserved) {
      const gameSessionId = event.context.gameSessionId;
      if (gameSessionId === null) {
        return {
          internalState: initialState(),
          progress: 0,
          reason: 'ate-game-start-missing-session-id'
        };
      }
      return {
        internalState: initialState(gameSessionId, event.eventId),
        progress: 0,
        reason: automaticRestartObserved
          ? 'ate-full-game-observation-started-at-automatic-restart-banner'
          : 'ate-full-game-observation-started',
        evidenceEventIds: [event.eventId]
      };
    }

    const state = runtime.internalState;
    if (!sameObservedGame(state, event.context.gameSessionId)) return null;

    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      const duplicate = roundSessionId !== null && (
        state.currentRoundSessionId === roundSessionId
        || state.eligibleRoundSessionIds.includes(roundSessionId)
        || state.interruptedRoundSessionIds.includes(roundSessionId)
      );
      if (duplicate) return null;

      const unresolvedPreviousTurn = state.currentRoundSessionId !== null;
      if (roundSessionId === null || event.context.meId === null || event.context.drawerId === null) {
        return {
          internalState: {
            ...state,
            currentRoundSessionId: null,
            currentRoundStartEventId: null,
            failed: true
          },
          progress: 0,
          reason: 'ate-round-start-missing-authoritative-context',
          evidenceEventIds: [event.eventId]
        };
      }

      return {
        internalState: {
          ...state,
          currentRoundSessionId: roundSessionId,
          currentRoundStartEventId: event.eventId,
          failed: state.failed || unresolvedPreviousTurn
        },
        progress: 0,
        reason: unresolvedPreviousTurn
          ? 'ate-unsettled-turn-before-next-turn-failed-game'
          : 'ate-drawing-turn-observation-started',
        ...(unresolvedPreviousTurn ? { evidenceEventIds: [event.eventId] } : {})
      };
    }

    if (event.type === 'ROUND_RESULTS_AVAILABLE') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) {
        return {
          internalState: { ...state, failed: true },
          progress: 0,
          reason: 'ate-round-results-missing-session-id',
          evidenceEventIds: [event.eventId]
        };
      }
      if (state.eligibleRoundSessionIds.includes(roundSessionId)
          || state.interruptedRoundSessionIds.includes(roundSessionId)) return null;
      if (state.currentRoundSessionId !== roundSessionId) {
        return {
          internalState: { ...state, failed: true },
          progress: 0,
          reason: 'ate-unobserved-round-results-failed-game',
          evidenceEventIds: [event.eventId]
        };
      }

      if (isDrawerLeft(event.payload.reason, event.payload.reasonName)) {
        return {
          internalState: {
            ...state,
            currentRoundSessionId: null,
            currentRoundStartEventId: null,
            interruptedRoundSessionIds: [...state.interruptedRoundSessionIds, roundSessionId]
          },
          progress: 0,
          reason: 'ate-drawer-left-turn-skipped',
          evidenceEventIds: [event.eventId]
        };
      }

      const selfPlayerId = event.context.meId;
      const selfScore = selfPlayerId === null
        ? undefined
        : event.payload.scores.find(score => score.playerId === selfPlayerId);
      const earnedPoints = selfScore !== undefined && selfScore.roundScore > 0;
      const eligibleRoundSessionIds = [...state.eligibleRoundSessionIds, roundSessionId];
      const successfulRoundSessionIds = earnedPoints
        ? [...state.successfulRoundSessionIds, roundSessionId]
        : state.successfulRoundSessionIds;
      const successfulEvidenceEventIds = earnedPoints
        ? [
            ...state.successfulEvidenceEventIds,
            ...(state.currentRoundStartEventId ? [state.currentRoundStartEventId] : []),
            event.eventId
          ]
        : state.successfulEvidenceEventIds;
      return {
        internalState: {
          ...state,
          currentRoundSessionId: null,
          currentRoundStartEventId: null,
          eligibleRoundSessionIds,
          successfulRoundSessionIds,
          successfulEvidenceEventIds,
          failed: state.failed || !earnedPoints
        },
        progress: 0,
        reason: earnedPoints
          ? 'ate-positive-points-earned-in-turn'
          : selfScore === undefined
            ? 'ate-missing-self-score-failed-game'
            : 'ate-zero-point-turn-failed-game',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'GAME_ENDED') return null;
    const complete = !state.failed
      && state.currentRoundSessionId === null
      && state.eligibleRoundSessionIds.length > 0
      && state.successfulRoundSessionIds.length === state.eligibleRoundSessionIds.length;
    const evidenceEventIds = complete
      ? [...state.successfulEvidenceEventIds, event.eventId]
      : [event.eventId];
    return {
      internalState: state,
      progress: complete ? 1 : 0,
      complete,
      reason: complete
        ? 'ate-positive-points-in-every-regular-turn-of-full-game'
        : state.currentRoundSessionId !== null
          ? 'ate-game-ended-with-unsettled-turn'
          : state.eligibleRoundSessionIds.length === 0
            ? 'ate-game-ended-without-eligible-turns'
            : 'ate-game-contained-zero-or-missing-score-turn',
      evidenceEventIds
    };
  }
};
