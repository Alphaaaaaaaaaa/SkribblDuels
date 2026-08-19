import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, localization } from '../shared';

export interface MyFavoriteColorIsRedParameters {
  maximumJoinSeconds: number;
}

export interface MyFavoriteColorIsRedState {
  qualifyingEvents: number;
  redAvatar: number[] | null;
  redRandomizedEventId: string | null;
  redRandomizedAt: number | null;
  redLoginEventId: string | null;
  redLoginAt: number | null;
}

function avatarFromUnknown(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const avatar = value.map(entry => typeof entry === 'number' ? entry : Number(entry));
  return avatar.every(entry => Number.isFinite(entry)) ? avatar : null;
}

function avatarsEqual(left: readonly number[] | null, right: readonly number[] | null): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function emptyState(): MyFavoriteColorIsRedState {
  return {
    qualifyingEvents: 0,
    redAvatar: null,
    redRandomizedEventId: null,
    redRandomizedAt: null,
    redLoginEventId: null,
    redLoginAt: null
  };
}

export const myFavoriteColorIsRedDefinition: ChallengeDefinition<
  MyFavoriteColorIsRedState,
  MyFavoriteColorIsRedParameters
> = {
  id: 'my-favorite-color-is-red',
  version: 2,
  metadata: {
    category: 'home',
    localization: localization(
      'My favorite color is Red',
      'Randomize your avatar until it has red skin, then join a public lobby with that avatar.',
      'My favorite color is Red',
      'Randomisiere deinen Avatar bis zu roter Haut und tritt anschließend mit diesem Avatar einer öffentlichen Lobby bei.'
    ),
    icon: 'my-favorite-color-is-red-avatar',
    rankedEligible: true,
    difficulty: 2
  },
  defaultParameters: {
    maximumJoinSeconds: 90
  },
  target: () => 1,
  createInitialState: emptyState,
  validateParameters(value): value is MyFavoriteColorIsRedParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isFinitePositiveNumber((value as Partial<MyFavoriteColorIsRedParameters>).maximumJoinSeconds);
  },
  relevantEvents: [
    'AVATAR_RANDOMIZED',
    'LOGIN_SUBMITTED',
    'RED_AVATAR_LOGIN_CONFIRMED',
    'LOBBY_HYDRATED'
  ],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'AVATAR_RANDOMIZED') {
      if (event.payload.validRandomization !== true) return null;
      const avatar = avatarFromUnknown(event.payload.avatar);
      if (!event.payload.redSkin || avatar?.[0] !== 0) {
        return {
          internalState: emptyState(),
          progress: 0,
          reason: 'avatar-randomized-to-non-red',
          evidenceEventIds: [event.eventId]
        };
      }
      return {
        internalState: {
          qualifyingEvents: 0,
          redAvatar: avatar.slice(),
          redRandomizedEventId: event.eventId,
          redRandomizedAt: event.occurredAt,
          redLoginEventId: null,
          redLoginAt: null
        },
        progress: 0,
        reason: 'red-avatar-randomization-observed',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'LOGIN_SUBMITTED') {
      const avatar = avatarFromUnknown((event.payload as Record<string, unknown>).avatar);
      if (avatar?.[0] === 0 && avatarsEqual(runtime.internalState.redAvatar, avatar)) return null;
      if (runtime.internalState.redRandomizedEventId === null) return null;
      return {
        internalState: emptyState(),
        progress: 0,
        reason: 'login-submitted-without-observed-red-randomization',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'RED_AVATAR_LOGIN_CONFIRMED') {
      const avatar = avatarFromUnknown(event.payload.avatar);
      if (avatar?.[0] !== 0) return null;
      if (runtime.internalState.redRandomizedEventId === null ||
          !avatarsEqual(runtime.internalState.redAvatar, avatar)) {
        return null;
      }
      const randomizedAt = runtime.internalState.redRandomizedAt;
      if (randomizedAt === null || event.occurredAt - randomizedAt > parameters.maximumJoinSeconds * 1000) {
        return {
          internalState: emptyState(),
          progress: 0,
          reason: 'red-login-outside-randomization-window',
          evidenceEventIds: [event.eventId]
        };
      }
      return {
        internalState: {
          ...runtime.internalState,
          redLoginEventId: event.eventId,
          redLoginAt: event.occurredAt
        },
        progress: 0,
        reason: 'red-avatar-login-confirmed',
        evidenceEventIds: [runtime.internalState.redRandomizedEventId, event.eventId]
      };
    }

    if (event.type !== 'LOBBY_HYDRATED') return null;
    const randomEventId = runtime.internalState.redRandomizedEventId;
    const loginEventId = runtime.internalState.redLoginEventId;
    const loginAt = runtime.internalState.redLoginAt;
    if (randomEventId === null || loginEventId === null || loginAt === null) return null;

    if (event.context.lobbyType !== 0 || event.occurredAt - loginAt > parameters.maximumJoinSeconds * 1000) {
      return {
        internalState: emptyState(),
        progress: 0,
        reason: event.context.lobbyType === 0
          ? 'public-lobby-hydration-outside-red-login-window'
          : 'red-avatar-joined-non-public-lobby',
        evidenceEventIds: [event.eventId]
      };
    }

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: 1
      },
      progress: 1,
      complete: true,
      reason: 'randomized-red-avatar-joined-public-lobby',
      evidenceEventIds: [randomEventId, loginEventId, event.eventId]
    };
  }
};
