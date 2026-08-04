import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface InAndOutParameters {
  players: number;
}

export interface InAndOutState {
  qualifyingEvents: number;
  joinedPlayerIds: number[];
  completedPlayerIds: number[];
  joinEventIdsByPlayer: Record<string, string>;
  evidenceEventIds: string[];
}

function eventPlayerId(event: {
  actor: { playerId: number | null; isSelf: boolean } | null;
  payload: Record<string, unknown>;
}): number | null {
  if (event.actor?.isSelf) return null;
  if (event.actor?.playerId !== null && event.actor?.playerId !== undefined) {
    return event.actor.playerId;
  }

  const payloadPlayerId = event.payload.playerId;
  if (typeof payloadPlayerId === 'number' && Number.isInteger(payloadPlayerId)) {
    return payloadPlayerId;
  }

  const user = event.payload.user;
  if (typeof user === 'object' && user !== null) {
    const id = (user as Record<string, unknown>).id;
    if (typeof id === 'number' && Number.isInteger(id)) return id;
  }

  return null;
}

export const inAndOutDefinition: ChallengeDefinition<InAndOutState, InAndOutParameters> = {
  id: 'in-and-out',
  version: 1,
  metadata: {
    category: 'lucky-fun',
    localization: localization(
      'In and out',
      'Witness 3 different players join and later leave the same public lobby.',
      'In and out',
      'Erlebe, wie 3 verschiedene Spieler derselben öffentlichen Lobby beitreten und sie später wieder verlassen.'
    ),
    icon: 'in-and-out-door',
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    players: 3
  },
  target: parameters => parameters.players,
  createInitialState: () => ({
    qualifyingEvents: 0,
    joinedPlayerIds: [],
    completedPlayerIds: [],
    joinEventIdsByPlayer: {},
    evidenceEventIds: []
  }),
  validateParameters(value): value is InAndOutParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<InAndOutParameters>).players);
  },
  relevantEvents: ['PLAYER_JOINED', 'PLAYER_LEFT'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'PLAYER_JOINED' && event.type !== 'PLAYER_LEFT') return null;

    const playerId = eventPlayerId(event);
    if (playerId === null || playerId === event.context.meId) return null;
    if (runtime.internalState.completedPlayerIds.includes(playerId)) return null;

    if (event.type === 'PLAYER_JOINED') {
      if (runtime.internalState.joinedPlayerIds.includes(playerId)) return null;

      return {
        internalState: {
          ...runtime.internalState,
          joinedPlayerIds: [...runtime.internalState.joinedPlayerIds, playerId],
          joinEventIdsByPlayer: {
            ...runtime.internalState.joinEventIdsByPlayer,
            [String(playerId)]: event.eventId
          }
        },
        reason: 'in-and-out-player-join-observed',
        evidenceEventIds: [event.eventId]
      };
    }

    if (!runtime.internalState.joinedPlayerIds.includes(playerId)) return null;

    const joinEventId = runtime.internalState.joinEventIdsByPlayer[String(playerId)];
    if (!joinEventId) return null;

    const completedPlayerIds = [...runtime.internalState.completedPlayerIds, playerId];
    const evidenceEventIds = [
      ...runtime.internalState.evidenceEventIds,
      joinEventId,
      event.eventId
    ];
    const progress = completedPlayerIds.length;

    return {
      internalState: {
        qualifyingEvents: progress,
        joinedPlayerIds: runtime.internalState.joinedPlayerIds,
        completedPlayerIds,
        joinEventIdsByPlayer: runtime.internalState.joinEventIdsByPlayer,
        evidenceEventIds
      },
      progress,
      complete: progress >= parameters.players,
      reason: 'in-and-out-player-completed-join-leave-pair',
      evidenceEventIds
    };
  }
};
