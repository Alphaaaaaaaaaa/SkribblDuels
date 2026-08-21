import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface HintReflexesParameters {
  milliseconds: number;
  amount: number;
}

export interface HintReflexesState {
  qualifyingEvents: number;
  roundSessionId: string | null;
  hintEventId: string | null;
  hintAtMonotonicMs: number | null;
  hintPositions: number[];
  guessedBeforeFirstHint: boolean;
}

function clearedState(qualifyingEvents: number, roundSessionId: string | null): HintReflexesState {
  return {
    qualifyingEvents,
    roundSessionId,
    hintEventId: null,
    hintAtMonotonicMs: null,
    hintPositions: [],
    guessedBeforeFirstHint: false
  };
}

export const hintReflexesDefinition: ChallengeDefinition<
  HintReflexesState,
  HintReflexesParameters
> = {
  id: 'hint-reflexes',
  version: 2,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Hint Reflexes',
      'Guess within two seconds after the first hint, provided nobody guessed before that hint.',
      'Hint Reflexes',
      'Errate das Wort innerhalb von zwei Sekunden nach dem ersten Hint, sofern zuvor niemand richtig geraten hat.'
    ),
    icon: 'hint-reflexes-lightning',
    rankedEligible: true,
    difficulty: 3
  },
  defaultParameters: {
    milliseconds: 2000,
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => clearedState(0, null),
  validateParameters(value): value is HintReflexesParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<HintReflexesParameters>;
    return isPositiveInteger(parameters.milliseconds) && isPositiveInteger(parameters.amount);
  },
  relevantEvents: ['ROUND_STARTED', 'HINT_REVEALED', 'CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      return {
        internalState: clearedState(runtime.internalState.qualifyingEvents, event.context.roundSessionId),
        reason: 'hint-reflexes-round-started'
      };
    }

    const roundSessionId = event.context.roundSessionId;
    if (roundSessionId === null) return null;

    if (event.type === 'HINT_REVEALED') {
      if (runtime.internalState.hintEventId !== null) return null;
      const positions = Array.isArray(event.payload.hints)
        ? event.payload.hints
            .map(hint => hint.position)
            .filter(position => Number.isInteger(position))
        : [];

      return {
        internalState: {
          qualifyingEvents: runtime.internalState.qualifyingEvents,
          roundSessionId,
          hintEventId: event.eventId,
          hintAtMonotonicMs: event.monotonicMs,
          hintPositions: positions,
          guessedBeforeFirstHint: runtime.internalState.guessedBeforeFirstHint
        },
        reason: runtime.internalState.guessedBeforeFirstHint
          ? 'first-hint-ineligible-because-player-already-guessed'
          : 'eligible-first-hint-recorded'
      };
    }

    if (event.type !== 'CORRECT_GUESS') return null;
    if (runtime.internalState.hintEventId === null) {
      return {
        internalState: {
          ...runtime.internalState,
          roundSessionId,
          guessedBeforeFirstHint: true
        },
        reason: 'correct-guess-observed-before-first-hint'
      };
    }
    if (!event.actor?.isSelf) return null;
    if (runtime.internalState.roundSessionId !== roundSessionId) return null;
    if (runtime.internalState.guessedBeforeFirstHint) return null;
    if (runtime.internalState.hintAtMonotonicMs === null) return null;

    const delayMs = event.monotonicMs - runtime.internalState.hintAtMonotonicMs;
    if (delayMs < 0 || delayMs > parameters.milliseconds) {
      return {
        internalState: clearedState(runtime.internalState.qualifyingEvents, roundSessionId),
        reason: 'correct-guess-outside-hint-window'
      };
    }

    const qualifyingEvents = runtime.internalState.qualifyingEvents + 1;
    return {
      internalState: {
        ...clearedState(qualifyingEvents, roundSessionId),
        hintPositions: runtime.internalState.hintPositions
      },
      progress: qualifyingEvents,
      complete: qualifyingEvents >= parameters.amount,
      reason: 'correct-within-hint-reaction-window',
      evidenceEventIds: [runtime.internalState.hintEventId, event.eventId]
    };
  }
};
