import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import {
  isPositiveInteger,
  localization,
  type CounterState
} from '../shared';

export interface SniperParameters {
  rounds: number;
}

export type SniperTurnStatus =
  | 'none'
  | 'guessing'
  | 'self-drawing'
  | 'interrupted'
  | 'succeeded';

export interface SniperState extends CounterState {
  /** One concrete drawing turn. The visible server round may contain many of these. */
  currentRoundSessionId: string | null;
  roundStartedEventId: string | null;
  turnStatus: SniperTurnStatus;

  /** Used for deduplication and completion evidence across the current streak. */
  successfulRoundSessionIds: string[];
  successfulEvidenceEventIds: string[];
}

function freshTurnState(
  previous: SniperState,
  roundSessionId: string,
  roundStartedEventId: string,
  selfIsDrawer: boolean,
  resetStreak: boolean
): SniperState {
  return {
    qualifyingEvents: resetStreak ? 0 : previous.qualifyingEvents,
    currentRoundSessionId: roundSessionId,
    roundStartedEventId,
    turnStatus: selfIsDrawer ? 'self-drawing' : 'guessing',
    successfulRoundSessionIds: resetStreak ? [] : previous.successfulRoundSessionIds,
    successfulEvidenceEventIds: resetStreak ? [] : previous.successfulEvidenceEventIds
  };
}

export const sniperDefinition: ChallengeDefinition<SniperState, SniperParameters> = {
  id: 'sniper',
  version: 3,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Sniper',
      'Guess correctly on your first attempt in 3 consecutive eligible drawing turns. Your own drawing turns and turns interrupted by the drawer leaving are skipped.',
      'Sniper',
      'Errate das Wort in 3 aufeinanderfolgenden gültigen Zeichen-Turns jeweils mit deinem ersten Versuch. Eigene Malrunden und durch den Drawer-Abgang unterbrochene Turns werden übersprungen.'
    ),
    icon: 'sniper-crosshair',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    rounds: 3
  },
  target: parameters => parameters.rounds,
  createInitialState: () => ({
    qualifyingEvents: 0,
    currentRoundSessionId: null,
    roundStartedEventId: null,
    turnStatus: 'none',
    successfulRoundSessionIds: [],
    successfulEvidenceEventIds: []
  }),
  validateParameters(value): value is SniperParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<SniperParameters>;
    return isPositiveInteger(parameters.rounds);
  },
  relevantEvents: [
    'ROUND_STARTED',
    'PLAYER_LEFT',
    'ROUND_ENDED',
    'WRONG_GUESS',
    'CORRECT_GUESS'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId === roundSessionId) return null;

      const previousEligibleTurnWasMissed =
        runtime.internalState.turnStatus === 'guessing' &&
        runtime.internalState.currentRoundSessionId !== null;
      const selfIsDrawer =
        event.context.meId !== null &&
        event.context.drawerId === event.context.meId;

      return {
        internalState: freshTurnState(
          runtime.internalState,
          roundSessionId,
          event.eventId,
          selfIsDrawer,
          previousEligibleTurnWasMissed
        ),
        progress: previousEligibleTurnWasMissed ? 0 : runtime.progress.current,
        reason: previousEligibleTurnWasMissed
          ? 'sniper-streak-reset-by-missed-turn-and-next-turn-started'
          : selfIsDrawer
            ? 'sniper-self-drawing-turn-skipped'
            : 'sniper-eligible-turn-started'
      };
    }

    if (event.type === 'PLAYER_LEFT') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
      if (event.payload.wasDrawer !== true) return null;
      if (runtime.internalState.turnStatus === 'succeeded') return null;

      return {
        internalState: {
          ...runtime.internalState,
          turnStatus: 'interrupted'
        },
        reason: 'sniper-drawer-left-turn-skipped',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type === 'ROUND_ENDED') {
      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;

      const drawerLeft = event.payload.reasonName === 'DRAWER_LEFT' || event.payload.reason === 2;
      if (drawerLeft && runtime.internalState.turnStatus !== 'succeeded') {
        return {
          internalState: {
            ...runtime.internalState,
            turnStatus: 'interrupted'
          },
          reason: 'sniper-interrupted-turn-skipped',
          evidenceEventIds: [event.eventId]
        };
      }

      if (runtime.internalState.turnStatus === 'guessing') {
        return {
          reset: true,
          reason: 'sniper-streak-reset-by-unanswered-turn',
          evidenceEventIds: [event.eventId]
        };
      }

      return null;
    }

    if (event.type === 'WRONG_GUESS') {
      if (!event.actor?.isSelf) return null;

      const roundSessionId = event.context.roundSessionId;
      if (roundSessionId === null) return null;
      if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
      if (runtime.internalState.turnStatus !== 'guessing') return null;

      return {
        reset: true,
        reason: 'sniper-streak-reset-by-wrong-first-attempt',
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;
    if (runtime.internalState.currentRoundSessionId !== roundSessionId) return null;
    if (runtime.internalState.roundStartedEventId === null) return null;
    if (runtime.internalState.turnStatus !== 'guessing') return null;
    if (runtime.internalState.successfulRoundSessionIds.includes(roundSessionId)) return null;

    if ((event.payload.wrongGuessesBeforeCorrect ?? 0) > 0) {
      return {
        reset: true,
        reason: 'sniper-streak-reset-by-correct-guess-after-earlier-attempt',
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
      complete: nextCount >= parameters.rounds,
      reason: 'sniper-correct-on-first-attempt',
      evidenceEventIds: nextEvidence
    };
  }
};
