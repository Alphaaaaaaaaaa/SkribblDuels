import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isPositiveInteger,
  localization,
  type CounterState
} from '../shared';

export interface OmgHackerParameters {
  firstGuesses: number;
}

export type OmgHackerTurnStatus =
  | 'none'
  | 'guessing'
  | 'self-drawing'
  | 'interrupted'
  | 'succeeded'
  | 'failed';

export interface OmgHackerState extends CounterState {
  currentRoundSessionId: string | null;
  roundStartedEventId: string | null;
  turnStatus: OmgHackerTurnStatus;
  successfulRoundSessionIds: string[];
  successfulEvidenceEventIds: string[];
}

function startTurn(
  previous: OmgHackerState,
  roundSessionId: string,
  roundStartedEventId: string,
  selfIsDrawer: boolean,
  resetStreak: boolean
): OmgHackerState {
  return {
    qualifyingEvents: resetStreak ? 0 : previous.qualifyingEvents,
    currentRoundSessionId: roundSessionId,
    roundStartedEventId,
    turnStatus: selfIsDrawer ? 'self-drawing' : 'guessing',
    successfulRoundSessionIds: resetStreak ? [] : previous.successfulRoundSessionIds,
    successfulEvidenceEventIds: resetStreak ? [] : previous.successfulEvidenceEventIds
  };
}

export const omgHackerDefinition: ChallengeDefinition<
  OmgHackerState,
  OmgHackerParameters
> = {
  id: 'omg-hacker',
  version: 1,
  metadata: {
    category: 'guessing',
    localization: localization(
      'OMG Hacker?!?!?',
      'Be the first player to guess correctly in 5 consecutive eligible drawing turns. Your own drawing turns and turns interrupted by the drawer leaving are skipped.',
      'OMG Hacker?!?!?',
      'Sei in 5 aufeinanderfolgenden gültigen Zeichen-Turns jeweils der erste Spieler, der das Wort richtig errät. Eigene Malrunden und durch den Drawer-Abgang unterbrochene Turns werden übersprungen.'
    ),
    icon: 'hacker-first-guess',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    firstGuesses: 5
  },
  target: parameters => parameters.firstGuesses,
  createInitialState: () => ({
    qualifyingEvents: 0,
    currentRoundSessionId: null,
    roundStartedEventId: null,
    turnStatus: 'none',
    successfulRoundSessionIds: [],
    successfulEvidenceEventIds: []
  }),
  validateParameters(value): value is OmgHackerParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<OmgHackerParameters>;
    return isPositiveInteger(parameters.firstGuesses);
  },
  relevantEvents: [
    'ROUND_STARTED',
    'PLAYER_LEFT',
    'ROUND_ENDED',
    'FIRST_GUESS'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId === roundSessionId) return null;

      const unresolvedEligibleTurn =
        runtime.internalState.turnStatus === 'guessing' &&
        runtime.internalState.currentRoundSessionId !== null;
      const selfIsDrawer =
        event.context.meId !== null &&
        event.context.drawerId === event.context.meId;

      return {
        internalState: startTurn(
          runtime.internalState,
          roundSessionId,
          event.eventId,
          selfIsDrawer,
          unresolvedEligibleTurn
        ),
        progress: unresolvedEligibleTurn ? 0 : runtime.progress.current,
        reason: unresolvedEligibleTurn
          ? 'omg-hacker-streak-reset-by-missed-turn-and-next-turn-started'
          : selfIsDrawer
            ? 'omg-hacker-self-drawing-turn-skipped'
            : 'omg-hacker-eligible-turn-started'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
      if (event.payload.wasDrawer !== true) return null;
      if (
        runtime.internalState.turnStatus === 'succeeded' ||
        runtime.internalState.turnStatus === 'failed'
      ) {
        return null;
      }

      return {
        internalState: {
          ...runtime.internalState,
          turnStatus: 'interrupted'
        },
        reason: 'omg-hacker-drawer-left-turn-skipped',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'ROUND_ENDED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;

      const drawerLeft = event.payload.reasonName === 'DRAWER_LEFT' || event.payload.reason === 2;
      if (
        drawerLeft &&
        runtime.internalState.turnStatus !== 'succeeded' &&
        runtime.internalState.turnStatus !== 'failed'
      ) {
        return {
          internalState: {
            ...runtime.internalState,
            turnStatus: 'interrupted'
          },
          reason: 'omg-hacker-interrupted-turn-skipped',
          evidenceEventIds: [event.eventId]
        };
      }

      if (runtime.internalState.turnStatus === 'guessing') {
        return {
          reset: true,
          reason: 'omg-hacker-streak-reset-by-turn-without-first-guess',
          evidenceEventIds: [event.eventId]
        };
      }

      return null;
    }

    if (event.type !== 'FIRST_GUESS') return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
    if (runtime.internalState.roundStartedEventId === null) return null;
    if (runtime.internalState.turnStatus !== 'guessing') return null;
    if (runtime.internalState.successfulRoundSessionIds.includes(roundSessionId)) return null;

    if (!event.actor?.isSelf) {
      return {
        reset: true,
        reason: 'omg-hacker-streak-reset-by-other-first-guesser',
        evidenceEventIds: [event.eventId]
      };
    }

    const nextCount = runtime.internalState.qualifyingEvents + 1;
    const nextEvidence = [
      ...runtime.internalState.successfulEvidenceEventIds,
      runtime.internalState.roundStartedEventId,
      event.eventId
    ];

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents: nextCount,
        turnStatus: 'succeeded',
        successfulRoundSessionIds: [
          ...runtime.internalState.successfulRoundSessionIds,
          roundSessionId
        ],
        successfulEvidenceEventIds: nextEvidence
      },
      progress: nextCount,
      complete: nextCount >= parameters.firstGuesses,
      reason: 'omg-hacker-self-first-guesser',
      evidenceEventIds: nextEvidence
    };
  }
};
