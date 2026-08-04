import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type { SkribblUserSnapshot } from '@skribbl-duels/telemetry-contracts';
import { isFinitePositiveNumber, localization } from '../shared';

export interface UltimateComebackParameters {
  lead: number;
}

export interface ComebackPlayer {
  playerId: number;
  name: string;
  baselineScore: number;
  currentScore: number;
  departed: boolean;
  eligibleBaselineTarget: boolean;
}

export interface UltimateComebackState {
  qualifyingEvents: number;
  lobbySessionId: string | null;
  baselineGameSessionId: string | null;
  selfPlayerId: number | null;
  selfBaselineScore: number | null;
  selfCurrentScore: number | null;
  hydrationEventId: string | null;
  players: ComebackPlayer[];
  eligibleTargetIds: number[];
  overtakenEligibleTargetIds: number[];
  eligibleTargetOvertakeEventIds: Record<string, string>;
  completedTargetId: number | null;
  completedLeaderId: number | null;
  invalidated: boolean;
  invalidatedReason: string | null;
}

function validPlayers(value: unknown): SkribblUserSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SkribblUserSnapshot => {
    if (typeof entry !== 'object' || entry === null) return false;
    const user = entry as Partial<SkribblUserSnapshot>;
    return typeof user.id === 'number' && Number.isInteger(user.id) &&
      typeof user.name === 'string' &&
      typeof user.score === 'number' && Number.isFinite(user.score);
  });
}

function eventPlayerId(event: {
  actor: { playerId: number | null } | null;
  payload: Record<string, unknown>;
}): number | null {
  if (event.actor?.playerId !== null && event.actor?.playerId !== undefined) return event.actor.playerId;
  const payloadId = event.payload.playerId;
  return typeof payloadId === 'number' && Number.isInteger(payloadId) ? payloadId : null;
}

function activePlayers(players: ComebackPlayer[]): ComebackPlayer[] {
  return players.filter(player => !player.departed);
}

function opponentLeader(players: ComebackPlayer[], selfPlayerId: number): ComebackPlayer | null {
  const opponents = activePlayers(players).filter(player => player.playerId !== selfPlayerId);
  return opponents.reduce<ComebackPlayer | null>((leader, player) =>
    leader === null || player.currentScore > leader.currentScore ? player : leader, null);
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function invalidate(
  state: UltimateComebackState,
  reason: string,
  eventId?: string
) {
  return {
    internalState: {
      ...state,
      qualifyingEvents: 0,
      eligibleTargetIds: [],
      overtakenEligibleTargetIds: [],
      eligibleTargetOvertakeEventIds: {},
      completedTargetId: null,
      completedLeaderId: null,
      invalidated: true,
      invalidatedReason: reason
    },
    progress: 0,
    reason,
    evidenceEventIds: eventId ? [eventId] : []
  };
}

export const ultimateComebackDefinition: ChallengeDefinition<
  UltimateComebackState,
  UltimateComebackParameters
> = {
  id: 'ultimate-comeback',
  version: 3,
  metadata: {
    category: 'progress',
    localization: localization(
      'Ultimate Comeback',
      'After joining a public lobby at least 1250 points behind, overtake at least one of those players and later become the strict #1 before that game ends.',
      'Ultimate Comeback',
      'Überhole vor dem Spielende mindestens einen Spieler, der bei deinem Lobbybeitritt 1250 Punkte Vorsprung hatte, und werde anschließend alleiniger Platz 1.'
    ),
    icon: 'ultimate-comeback-arrow',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: { lead: 1250 },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    lobbySessionId: null,
    baselineGameSessionId: null,
    selfPlayerId: null,
    selfBaselineScore: null,
    selfCurrentScore: null,
    hydrationEventId: null,
    players: [],
    eligibleTargetIds: [],
    overtakenEligibleTargetIds: [],
    eligibleTargetOvertakeEventIds: {},
    completedTargetId: null,
    completedLeaderId: null,
    invalidated: false,
    invalidatedReason: null
  }),
  validateParameters(value): value is UltimateComebackParameters {
    return typeof value === 'object' && value !== null &&
      isFinitePositiveNumber((value as Partial<UltimateComebackParameters>).lead);
  },
  relevantEvents: [
    'LOBBY_HYDRATED',
    'PLAYER_JOINED',
    'PLAYER_LEFT',
    'SCORE_CHANGED',
    'GAME_ENDED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'LOBBY_HYDRATED') {
      const meId = event.context.meId;
      const snapshot = validPlayers(event.payload.players);
      const self = meId === null ? null : snapshot.find(player => player.id === meId) ?? null;
      if (!self || event.context.gameSessionId === null) {
        return invalidate({
          ...runtime.internalState,
          lobbySessionId: event.context.lobbySessionId,
          baselineGameSessionId: event.context.gameSessionId,
          selfPlayerId: meId,
          selfBaselineScore: self?.score ?? null,
          selfCurrentScore: self?.score ?? null,
          hydrationEventId: event.eventId,
          players: [],
          eligibleTargetIds: [],
          overtakenEligibleTargetIds: [],
          eligibleTargetOvertakeEventIds: {}
        }, 'ultimate-comeback-no-active-game-baseline', event.eventId);
      }

      const eligibleTargetIds = snapshot
        .filter(player => player.id !== self.id && player.score - self.score >= parameters.lead)
        .map(player => player.id);
      const players = snapshot.map(player => ({
        playerId: player.id,
        name: player.name,
        baselineScore: player.score,
        currentScore: player.score,
        departed: false,
        eligibleBaselineTarget: eligibleTargetIds.includes(player.id)
      }));

      return {
        internalState: {
          qualifyingEvents: 0,
          lobbySessionId: event.context.lobbySessionId,
          baselineGameSessionId: event.context.gameSessionId,
          selfPlayerId: self.id,
          selfBaselineScore: self.score,
          selfCurrentScore: self.score,
          hydrationEventId: event.eventId,
          players,
          eligibleTargetIds,
          overtakenEligibleTargetIds: [],
          eligibleTargetOvertakeEventIds: {},
          completedTargetId: null,
          completedLeaderId: null,
          invalidated: eligibleTargetIds.length === 0,
          invalidatedReason: eligibleTargetIds.length === 0
            ? 'no-player-led-by-required-margin-at-join'
            : null
        },
        progress: 0,
        reason: eligibleTargetIds.length > 0
          ? 'ultimate-comeback-game-baseline-captured'
          : 'ultimate-comeback-no-eligible-target-at-join',
        evidenceEventIds: [event.eventId]
      };
    }

    if (runtime.internalState.invalidated) return null;

    if (event.type === 'GAME_ENDED') {
      return invalidate(runtime.internalState, 'ultimate-comeback-baseline-game-ended', event.eventId);
    }

    if (runtime.internalState.baselineGameSessionId === null ||
        event.context.gameSessionId !== runtime.internalState.baselineGameSessionId) {
      return invalidate(runtime.internalState, 'ultimate-comeback-game-session-changed', event.eventId);
    }

    if (event.type === 'PLAYER_JOINED') {
      const user = event.payload.user;
      if (!user || runtime.internalState.players.some(player => player.playerId === user.id)) return null;
      return {
        internalState: {
          ...runtime.internalState,
          players: [...runtime.internalState.players, {
            playerId: user.id,
            name: user.name,
            baselineScore: user.score,
            currentScore: user.score,
            departed: false,
            eligibleBaselineTarget: false
          }]
        },
        reason: 'ultimate-comeback-later-player-added-to-leaderboard-only'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const playerId = eventPlayerId(event);
      if (playerId === null || !runtime.internalState.players.some(player => player.playerId === playerId)) return null;
      return {
        internalState: {
          ...runtime.internalState,
          players: runtime.internalState.players.map(player =>
            player.playerId === playerId ? { ...player, departed: true } : player)
        },
        reason: 'ultimate-comeback-player-left'
      };
    }

    if (event.type !== 'SCORE_CHANGED' || event.payload.totalScore === null) return null;
    const playerId = event.payload.playerId ?? event.actor?.playerId ?? null;
    if (playerId === null) return null;

    const existing = runtime.internalState.players.find(player => player.playerId === playerId);
    if (!existing) return null;

    if (event.payload.totalScore < existing.currentScore) {
      return invalidate(runtime.internalState, 'ultimate-comeback-score-reset-detected', event.eventId);
    }

    const selfId = runtime.internalState.selfPlayerId;
    if (selfId === null) return null;
    const playersBefore = runtime.internalState.players;
    const leaderBefore = opponentLeader(playersBefore, selfId);
    const players = playersBefore.map(player =>
      player.playerId === playerId
        ? { ...player, currentScore: event.payload.totalScore ?? player.currentScore }
        : player
    );
    const selfBefore = playersBefore.find(player => player.playerId === selfId) ?? null;
    const self = players.find(player => player.playerId === selfId) ?? null;
    const leaderAfter = opponentLeader(players, selfId);

    if (!self || !leaderAfter) {
      return {
        internalState: {
          ...runtime.internalState,
          selfCurrentScore: self?.currentScore ?? runtime.internalState.selfCurrentScore,
          players
        },
        reason: 'ultimate-comeback-leaderboard-updated',
        evidenceEventIds: [event.eventId]
      };
    }

    let overtakenEligibleTargetIds = runtime.internalState.overtakenEligibleTargetIds;
    let eligibleTargetOvertakeEventIds = runtime.internalState.eligibleTargetOvertakeEventIds;

    if (playerId === selfId && selfBefore) {
      const newlyOvertaken = playersBefore.filter(target =>
        !target.departed &&
        target.eligibleBaselineTarget &&
        selfBefore.currentScore <= target.currentScore &&
        self.currentScore > target.currentScore
      );
      if (newlyOvertaken.length > 0) {
        overtakenEligibleTargetIds = uniqueNumbers([
          ...overtakenEligibleTargetIds,
          ...newlyOvertaken.map(target => target.playerId)
        ]);
        eligibleTargetOvertakeEventIds = {
          ...eligibleTargetOvertakeEventIds,
          ...Object.fromEntries(newlyOvertaken.map(target => [String(target.playerId), event.eventId]))
        };
      }
    }

    const strictFirst = self.currentScore > leaderAfter.currentScore;
    const hasOvertakenBaselineTarget = overtakenEligibleTargetIds.length > 0;

    if (!(playerId === selfId && strictFirst && hasOvertakenBaselineTarget)) {
      return {
        internalState: {
          ...runtime.internalState,
          selfCurrentScore: self.currentScore,
          players,
          overtakenEligibleTargetIds,
          eligibleTargetOvertakeEventIds
        },
        progress: 0,
        reason: hasOvertakenBaselineTarget
          ? 'ultimate-comeback-baseline-target-overtaken-waiting-for-first-place'
          : 'ultimate-comeback-no-baseline-target-overtaken-yet',
        evidenceEventIds: [event.eventId]
      };
    }

    const completedTargetId = overtakenEligibleTargetIds[0] ?? null;
    const targetOvertakeEventId = completedTargetId === null
      ? null
      : eligibleTargetOvertakeEventIds[String(completedTargetId)] ?? null;
    const evidenceEventIds = uniqueStrings([
      ...(runtime.internalState.hydrationEventId ? [runtime.internalState.hydrationEventId] : []),
      ...(targetOvertakeEventId ? [targetOvertakeEventId] : []),
      event.eventId
    ]);

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: 1,
        selfCurrentScore: self.currentScore,
        players,
        overtakenEligibleTargetIds,
        eligibleTargetOvertakeEventIds,
        completedTargetId,
        completedLeaderId: leaderBefore?.playerId ?? leaderAfter.playerId
      },
      progress: 1,
      complete: true,
      reason: 'ultimate-comeback-overtook-baseline-target-and-later-became-strict-first',
      evidenceEventIds
    };
  }
};
