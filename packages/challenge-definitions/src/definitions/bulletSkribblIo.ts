import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface BulletSkribblIoParameters {
  amount: number;
  maximumElapsedMs: number;
}

export interface BulletSkribblIoState {
  eligibleRoundSessionId: string | null;
  roundStartedEventId: string | null;
  qualifyingRoundSessionIds: string[];
  evidenceEventIds: string[];
}

export const bulletSkribblIoDefinition: ChallengeDefinition<
  BulletSkribblIoState,
  BulletSkribblIoParameters
> = {
  id: 'bullet-skribbl-io',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Bullet skribbl.io',
      'Correctly guess 5 words within 10 seconds after witnessing each drawing turn start.',
      'Bullet skribbl.io',
      'Errate 5 Wörter innerhalb von jeweils 10 Sekunden, nachdem du den Beginn des Zeichen-Turns erlebt hast.'
    ),
    icon: 'bullet-fast-guesses',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    amount: 5,
    maximumElapsedMs: 10000
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    eligibleRoundSessionId: null,
    roundStartedEventId: null,
    qualifyingRoundSessionIds: [],
    evidenceEventIds: []
  }),
  validateParameters(value): value is BulletSkribblIoParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<BulletSkribblIoParameters>;
    return isPositiveInteger(parameters.amount)
      && isPositiveInteger(parameters.maximumElapsedMs);
  },
  relevantEvents: ['ROUND_STARTED', 'CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      const meId = event.context.meId;
      const drawerId = event.context.drawerId ?? event.payload.drawerId;
      const eligible = roundSessionId !== null
        && meId !== null
        && drawerId !== null
        && drawerId !== meId;

      return {
        internalState: {
          ...runtime.internalState,
          eligibleRoundSessionId: eligible ? roundSessionId : null,
          roundStartedEventId: eligible ? event.eventId : null
        },
        reason: eligible
          ? 'bullet-fresh-foreign-round-observed'
          : 'bullet-round-ineligible'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;
    if (event.payload.elapsedMs === null || event.payload.elapsedMs > parameters.maximumElapsedMs) return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (runtime.internalState.eligibleRoundSessionId !== roundSessionId) return null;
    if (runtime.internalState.roundStartedEventId === null) return null;
    if (runtime.internalState.qualifyingRoundSessionIds.includes(roundSessionId)) return null;

    const qualifyingRoundSessionIds = [
      ...runtime.internalState.qualifyingRoundSessionIds,
      roundSessionId
    ];
    const evidenceEventIds = [
      ...runtime.internalState.evidenceEventIds,
      runtime.internalState.roundStartedEventId,
      event.eventId
    ];
    const progress = qualifyingRoundSessionIds.length;

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingRoundSessionIds,
        evidenceEventIds
      },
      progress,
      complete: progress >= parameters.amount,
      reason: `bullet-fast-guess-${progress}-of-${parameters.amount}`,
      evidenceEventIds
    };
  }
};
