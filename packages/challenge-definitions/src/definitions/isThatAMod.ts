import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, localization } from '../shared';

export interface IsThatAModParameters {
  stableSeconds: number;
}

export interface IsThatAModState {
  qualifyingEvents: number;
  lastClickId: string | null;
  lastClickEventId: string | null;
  lastAvatarIndex: number | null;
  clickCount: number;
  specialId: number | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const isThatAModDefinition: ChallengeDefinition<
  IsThatAModState,
  IsThatAModParameters
> = {
  id: 'is-that-a-mod',
  version: 1,
  metadata: {
    category: 'lucky-fun',
    localization: localization(
      'Is ThAT a MoD?',
      'Click the avatars below the homepage logo until one reveals a special and remains unchanged for one second.',
      'Is ThAT a MoD?',
      'Klicke die Avatare unter dem Logo an, bis ein Special erscheint und der Avatar eine Sekunde unverändert bleibt.'
    ),
    icon: 'is-that-a-mod-special-avatar',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: {
    stableSeconds: 1
  },
  target: () => 1,
  createInitialState: () => ({
    qualifyingEvents: 0,
    lastClickId: null,
    lastClickEventId: null,
    lastAvatarIndex: null,
    clickCount: 0,
    specialId: null
  }),
  validateParameters(value): value is IsThatAModParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isFinitePositiveNumber((value as Partial<IsThatAModParameters>).stableSeconds);
  },
  relevantEvents: ['LOGO_AVATAR_CLICKED', 'SPECIAL_AVATAR_FOUND'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'LOGO_AVATAR_CLICKED') {
      return {
        internalState: {
          qualifyingEvents: 0,
          lastClickId: stringOrNull(event.payload.clickId),
          lastClickEventId: event.eventId,
          lastAvatarIndex: finiteNumber(event.payload.avatarIndex),
          clickCount: finiteNumber(event.payload.clickCount) ?? runtime.internalState.clickCount,
          specialId: null
        },
        progress: 0,
        reason: 'logo-avatar-click-observed',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'SPECIAL_AVATAR_FOUND') return null;

    const clickId = stringOrNull(event.payload.clickId);
    const avatarIndex = finiteNumber(event.payload.avatarIndex);
    const stableForMs = finiteNumber(event.payload.stableForMs);
    if (clickId === null || avatarIndex === null || stableForMs === null) return null;
    if (clickId !== runtime.internalState.lastClickId ||
        avatarIndex !== runtime.internalState.lastAvatarIndex ||
        stableForMs < parameters.stableSeconds * 1000) {
      return null;
    }

    const evidence = [runtime.internalState.lastClickEventId, event.eventId]
      .filter((value): value is string => value !== null);
    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: 1,
        specialId: finiteNumber(event.payload.specialId)
      },
      progress: 1,
      complete: true,
      reason: 'special-avatar-stable',
      evidenceEventIds: evidence
    };
  }
};
