import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, localization } from '../shared';

export interface OwnerOfTheLobbyParameters {
  maximumWaitSeconds: number;
}

export interface OwnerOfTheLobbyState {
  qualifyingEvents: number;
  createRequestEventId: string | null;
  createRequestedAt: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export const ownerOfTheLobbyDefinition: ChallengeDefinition<
  OwnerOfTheLobbyState,
  OwnerOfTheLobbyParameters
> = {
  id: 'owner-of-the-lobby',
  version: 2,
  metadata: {
    category: 'home',
    localization: localization(
      'Owner of the Lobby',
      'Create your own private lobby and reach the private lobby screen.',
      'Owner of the Lobby',
      'Erstelle deine eigene private Lobby und erreiche den privaten Lobbyraum.'
    ),
    icon: 'owner-of-the-lobby-crown',
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    maximumWaitSeconds: 60
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    createRequestEventId: null,
    createRequestedAt: null
  }),
  validateParameters(value): value is OwnerOfTheLobbyParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isFinitePositiveNumber((value as Partial<OwnerOfTheLobbyParameters>).maximumWaitSeconds);
  },
  relevantEvents: [
    'PRIVATE_LOBBY_CREATE_REQUESTED',
    'PRIVATE_LOBBY_READY',
    'LOBBY_HYDRATED',
    'LOBBY_JOIN_REQUESTED',
    'GAME_START_FAILED'
  ],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'PRIVATE_LOBBY_CREATE_REQUESTED') {
      return {
        internalState: {
          qualifyingEvents: 0,
          createRequestEventId: event.eventId,
          createRequestedAt: event.occurredAt
        },
        progress: 0,
        reason: 'private-lobby-create-request-observed',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'LOBBY_JOIN_REQUESTED' || event.type === 'GAME_START_FAILED') {
      if (runtime.internalState.createRequestEventId === null) return null;
      return {
        internalState: {
          qualifyingEvents: 0,
          createRequestEventId: null,
          createRequestedAt: null
        },
        progress: 0,
        reason: 'private-lobby-create-attempt-cleared',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'PRIVATE_LOBBY_READY' && event.type !== 'LOBBY_HYDRATED') return null;
    const requestEventId = runtime.internalState.createRequestEventId;
    const requestedAt = runtime.internalState.createRequestedAt;
    if (requestEventId === null || requestedAt === null) return null;

    const elapsedMs = event.occurredAt - requestedAt;
    if (elapsedMs < 0 || elapsedMs > parameters.maximumWaitSeconds * 1000) {
      return {
        internalState: {
          qualifyingEvents: 0,
          createRequestEventId: null,
          createRequestedAt: null
        },
        progress: 0,
        reason: 'private-lobby-ready-outside-create-window',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'LOBBY_HYDRATED') {
      const ownerId = numberOrNull(event.payload.ownerId);
      const meId = event.context.meId ?? numberOrNull(event.payload.meId);
      if (event.context.lobbyType !== 1 || meId === null || ownerId !== meId) return null;
    } else if (event.context.lobbyType !== 1) {
      return null;
    }

    return {
      internalState: {
        qualifyingEvents: 1,
        createRequestEventId: requestEventId,
        createRequestedAt: requestedAt
      },
      progress: 1,
      complete: true,
      reason: event.type === 'LOBBY_HYDRATED'
        ? 'own-private-lobby-hydrated'
        : 'own-private-lobby-created',
      evidenceEventIds: [requestEventId, event.eventId]
    };
  }
};
