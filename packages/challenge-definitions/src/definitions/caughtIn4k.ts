import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, localization } from '../shared';

export interface CaughtIn4kParameters {
  score: number;
}

export interface CaughtIn4kState {
  qualifyingEvents: number;
  latestSelfScore: number | null;
  latestScoreEventId: string | null;
  winningScore: number | null;
}

function finalScoreSummary(
  meId: number | null,
  finalScores: readonly { playerId: number; totalScore: number; roundScore: number }[] | undefined
): { selfScore: number; winningScore: number; isWinner: boolean } | null {
  if (!finalScores || finalScores.length === 0 || meId === null) return null;

  let selfScore: number | null = null;
  let winningScore = Number.NEGATIVE_INFINITY;
  for (const entry of finalScores) {
    if (typeof entry !== 'object' || entry === null) continue;
    const totalScore = typeof entry.totalScore === 'number' && Number.isFinite(entry.totalScore)
      ? entry.totalScore
      : null;
    if (totalScore === null) continue;
    winningScore = Math.max(winningScore, totalScore);
    if (entry.playerId === meId) selfScore = totalScore;
  }

  if (selfScore === null || !Number.isFinite(winningScore)) return null;
  return {
    selfScore,
    winningScore,
    isWinner: selfScore === winningScore
  };
}

export const caughtIn4kDefinition: ChallengeDefinition<
  CaughtIn4kState,
  CaughtIn4kParameters
> = {
  id: 'caught-in-4k',
  version: 3,
  metadata: {
    category: 'progress',
    localization: localization(
      'Caught in 4k',
      'Win a public skribbl game with a final score of at least 4000.',
      'Caught in 4k',
      'Gewinne ein öffentliches Skribbl-Spiel mit mindestens 4000 Punkten.'
    ),
    icon: 'caught-in-4k-camera',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    score: 4000
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    latestSelfScore: null,
    latestScoreEventId: null,
    winningScore: null
  }),
  validateParameters(value): value is CaughtIn4kParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isFinitePositiveNumber((value as Partial<CaughtIn4kParameters>).score);
  },
  relevantEvents: ['SCORE_CHANGED', 'GAME_ENDED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change', 'game-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'SCORE_CHANGED') {
      const selfScoreEvent = event.actor?.isSelf === true ||
        (event.context.meId !== null && event.payload.playerId === event.context.meId);
      if (!selfScoreEvent || event.payload.totalScore === null) return null;

      return {
        internalState: {
          qualifyingEvents: 0,
          latestSelfScore: event.payload.totalScore,
          latestScoreEventId: event.eventId,
          winningScore: runtime.internalState.winningScore
        },
        progress: 0,
        reason: 'caught-in-4k-self-score-updated',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'GAME_ENDED') return null;
    const summary = finalScoreSummary(event.context.meId, event.payload.finalScores);
    if (summary === null) {
      return {
        internalState: {
          ...runtime.internalState,
          qualifyingEvents: 0
        },
        progress: 0,
        reason: 'caught-in-4k-final-ranking-unavailable',
        evidenceEventIds: [event.eventId]
      };
    }

    if (summary.selfScore < parameters.score || !summary.isWinner) {
      return {
        internalState: {
          ...runtime.internalState,
          qualifyingEvents: 0,
          latestSelfScore: summary.selfScore,
          winningScore: summary.winningScore
        },
        progress: 0,
        reason: summary.selfScore < parameters.score
          ? 'caught-in-4k-game-ended-below-threshold'
          : 'caught-in-4k-game-ended-without-winning',
        evidenceEventIds: [event.eventId]
      };
    }

    const evidenceEventIds = runtime.internalState.latestScoreEventId
      ? [runtime.internalState.latestScoreEventId, event.eventId]
      : [event.eventId];

    return {
      internalState: {
        qualifyingEvents: 1,
        latestSelfScore: summary.selfScore,
        latestScoreEventId: runtime.internalState.latestScoreEventId,
        winningScore: summary.winningScore
      },
      progress: 1,
      complete: true,
      reason: 'caught-in-4k-public-game-won-at-or-above-threshold',
      evidenceEventIds
    };
  }
};
