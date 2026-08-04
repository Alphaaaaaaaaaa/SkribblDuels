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
}

function winnerSummary(
  meId: number | null,
  finalScores: readonly { playerId: number; totalScore: number; roundScore: number }[] | undefined
): { selfScore: number; winningScore: number; won: boolean } | null {
  if (meId === null || !finalScores || finalScores.length === 0) return null;
  let selfScore: number | null = null;
  let winningScore = Number.NEGATIVE_INFINITY;
  for (const entry of finalScores) {
    if (!Number.isFinite(entry.totalScore)) continue;
    winningScore = Math.max(winningScore, entry.totalScore);
    if (entry.playerId === meId) selfScore = entry.totalScore;
  }
  if (selfScore === null || !Number.isFinite(winningScore)) return null;
  return { selfScore, winningScore, won: selfScore === winningScore };
}

function emptyState(): BackToBackState {
  return {
    qualifyingEvents: 0,
    streakLobbyId: null,
    winningGameKeys: [],
    winningEvidenceEventIds: [],
    lastEndedGameKey: null
  };
}

export const backToBackDefinition: ChallengeDefinition<BackToBackState, BackToBackParameters> = {
  id: 'back-to-back',
  version: 2,
  metadata: {
    category: 'progress',
    localization: localization(
      'Back to back',
      'Win two consecutive public skribbl games in the same lobby. The first win may come from a game joined after it already started.',
      'Back to back',
      'Gewinne zwei öffentliche Skribbl-Spiele direkt hintereinander in derselben Lobby. Dem ersten gewonnenen Spiel darfst du erst nach dessen Start beigetreten sein.'
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
  relevantEvents: ['LOBBY_CHANGED', 'GAME_ENDED'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'LOBBY_CHANGED') {
      if (runtime.internalState.qualifyingEvents === 0 && runtime.internalState.streakLobbyId === null) return null;
      return {
        internalState: emptyState(),
        progress: 0,
        reason: 'back-to-back-streak-reset-by-lobby-change',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'GAME_ENDED') return null;
    const lobbyId = event.context.lobbyId;
    if (lobbyId === null) return null;
    const gameKey = `${lobbyId}:${event.context.gameSessionId ?? event.eventId}`;
    if (runtime.internalState.lastEndedGameKey === gameKey) return null;

    const summary = winnerSummary(event.context.meId, event.payload.finalScores);
    const sameLobby = runtime.internalState.streakLobbyId === null || runtime.internalState.streakLobbyId === lobbyId;
    if (summary === null || !summary.won || !sameLobby) {
      return {
        internalState: {
          ...emptyState(),
          lastEndedGameKey: gameKey
        },
        progress: 0,
        reason: !sameLobby
          ? 'back-to-back-streak-reset-by-different-lobby'
          : summary === null
            ? 'back-to-back-game-ended-without-final-ranking'
            : 'back-to-back-streak-reset-by-loss',
        evidenceEventIds: [event.eventId]
      };
    }

    const nextCount = runtime.internalState.qualifyingEvents + 1;
    const evidence = [...runtime.internalState.winningEvidenceEventIds, event.eventId];
    return {
      internalState: {
        qualifyingEvents: nextCount,
        streakLobbyId: lobbyId,
        winningGameKeys: [...runtime.internalState.winningGameKeys, gameKey],
        winningEvidenceEventIds: evidence,
        lastEndedGameKey: gameKey
      },
      progress: nextCount,
      complete: nextCount >= parameters.games,
      reason: nextCount >= parameters.games
        ? 'back-to-back-consecutive-same-lobby-games-won'
        : 'back-to-back-first-same-lobby-game-won',
      evidenceEventIds: evidence
    };
  }
};
