import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface BackToBackParameters {
  games: number;
}

export interface BackToBackState {
  qualifyingEvents: number;
  streakLobbyId: string | null;
  winningGameKeys: string[];
  winningEvidenceEventIds: string[];
  lastEndedGameKey: string | null;
  currentScores: Array<{ playerId: number; totalScore: number; roundScore: number }>;
}

function winnerSummary(
  meId: number | null,
  finalScores: readonly { playerId: number; totalScore: number; roundScore: number }[] | undefined,
  trackedScores: readonly { playerId: number; totalScore: number; roundScore: number }[]
): { selfScore: number; winningScore: number; won: boolean } | null {
  if (meId === null) return null;
  const coherent = new Map<number, { playerId: number; totalScore: number; roundScore: number }>();
  for (const entry of trackedScores) coherent.set(entry.playerId, { ...entry });
  for (const entry of finalScores ?? []) {
    const previous = coherent.get(entry.playerId);
    coherent.set(entry.playerId, {
      playerId: entry.playerId,
      totalScore: Math.max(previous?.totalScore ?? Number.NEGATIVE_INFINITY, entry.totalScore),
      roundScore: Math.max(previous?.roundScore ?? Number.NEGATIVE_INFINITY, entry.roundScore)
    });
  }
  if (coherent.size === 0) return null;
  let selfScore: number | null = null;
  let winningScore = Number.NEGATIVE_INFINITY;
  for (const entry of coherent.values()) {
    if (!Number.isFinite(entry.totalScore)) continue;
    winningScore = Math.max(winningScore, entry.totalScore);
    if (entry.playerId === meId) selfScore = entry.totalScore;
  }
  if (selfScore === null || !Number.isFinite(winningScore)) return null;
  return { selfScore, winningScore, won: selfScore > 0 && selfScore === winningScore };
}

function emptyState(): BackToBackState {
  return {
    qualifyingEvents: 0,
    streakLobbyId: null,
    winningGameKeys: [],
    winningEvidenceEventIds: [],
    lastEndedGameKey: null,
    currentScores: []
  };
}

function upsertScore(
  scores: BackToBackState['currentScores'],
  playerId: number,
  totalScore: number,
  roundScore: number
): BackToBackState['currentScores'] {
  const next = scores.filter(score => score.playerId !== playerId);
  next.push({ playerId, totalScore, roundScore });
  return next;
}

function gameKey(lobbyId: string, gameSessionId: string | null, eventId: string): string {
  return `${lobbyId}:${gameSessionId ?? eventId}`;
}

export const backToBackDefinition: ChallengeDefinition<BackToBackState, BackToBackParameters> = {
  id: 'back-to-back',
  version: 6,
  metadata: {
    category: 'progress',
    localization: localization(
      'Back to back',
      'Finish first in two consecutive public skribbl games in the same lobby with a positive score. Either game may already be running when observed.',
      'Back to back',
      'Beende zwei öffentliche Skribbl-Spiele mit positiver Punktzahl direkt hintereinander auf Platz 1 in derselben Lobby. Beide Spiele dürfen beim Beobachtungsbeginn bereits laufen.'
    ),
    icon: 'back-to-back-wins',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    games: 2
  },
  target: parameters => parameters.games,
  createInitialState: emptyState,
  validateParameters(value): value is BackToBackParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<BackToBackParameters>).games);
  },
  relevantEvents: ['LOBBY_HYDRATED', 'SCORE_CHANGED', 'ROUND_RESULTS_AVAILABLE', 'GAME_ENDED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'LOBBY_HYDRATED') {
      if (!event.payload.players) return null;
      return {
        internalState: {
          ...runtime.internalState,
          currentScores: event.payload.players.map(player => ({
            playerId: player.id,
            totalScore: player.score,
            roundScore: 0
          }))
        },
        reason: 'back-to-back-scoreboard-hydrated'
      };
    }

    if (event.type === 'SCORE_CHANGED') {
      const playerId = event.payload.playerId;
      const totalScore = event.payload.totalScore;
      if (playerId === null || totalScore === null) return null;
      return {
        internalState: {
          ...runtime.internalState,
          currentScores: upsertScore(
            runtime.internalState.currentScores,
            playerId,
            totalScore,
            event.payload.roundScore ?? 0
          )
        },
        reason: 'back-to-back-score-snapshot-updated'
      };
    }

    if (event.type === 'ROUND_RESULTS_AVAILABLE') {
      return {
        internalState: {
          ...runtime.internalState,
          currentScores: event.payload.scores.map(score => ({ ...score }))
        },
        reason: 'back-to-back-coherent-round-scores-recorded'
      };
    }

    if (event.type !== 'GAME_ENDED') return null;
    const lobbyId = event.context.lobbyId;
    if (lobbyId === null) return null;
    const endedGameKey = gameKey(lobbyId, event.context.gameSessionId, event.eventId);
    if (runtime.internalState.lastEndedGameKey === endedGameKey
        || runtime.internalState.winningGameKeys.includes(endedGameKey)) return null;

    const summary = winnerSummary(
      event.context.meId,
      event.payload.finalScores,
      runtime.internalState.currentScores
    );
    const sameLobby = runtime.internalState.streakLobbyId === null || runtime.internalState.streakLobbyId === lobbyId;
    if (summary === null || !summary.won) {
      return {
        internalState: {
          ...emptyState(),
          lastEndedGameKey: endedGameKey
        },
        progress: 0,
        reason: summary === null
          ? 'back-to-back-game-ended-without-final-ranking'
          : summary.selfScore <= 0
            ? 'back-to-back-zero-point-win-invalid'
            : 'back-to-back-streak-reset-by-loss',
        evidenceEventIds: [event.eventId]
      };
    }

    const continuesStreak = sameLobby;
    const nextCount = continuesStreak ? runtime.internalState.qualifyingEvents + 1 : 1;
    const evidence = continuesStreak
      ? [
          ...runtime.internalState.winningEvidenceEventIds,
          event.eventId
        ]
      : [event.eventId];
    return {
      internalState: {
        qualifyingEvents: nextCount,
        streakLobbyId: lobbyId,
        winningGameKeys: continuesStreak
          ? [...runtime.internalState.winningGameKeys, endedGameKey]
          : [endedGameKey],
        winningEvidenceEventIds: evidence,
        lastEndedGameKey: endedGameKey,
        currentScores: []
      },
      progress: nextCount,
      complete: nextCount >= parameters.games,
      reason: nextCount >= parameters.games
        ? 'back-to-back-consecutive-same-lobby-games-won'
        : !sameLobby
          ? 'back-to-back-new-lobby-first-win'
          : 'back-to-back-first-same-lobby-game-won',
      evidenceEventIds: evidence
    };
  }
};
