import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface DropStreakParameters {
  catches: number;
}

export interface DropStreakState {
  activeObservationId: string | null;
  activeSpawnEventId: string | null;
  caughtObservationIds: string[];
  evidenceEventIds: string[];
  resolvedObservationIds: string[];
}

const MAX_RESOLVED_OBSERVATIONS = 128;

function initialState(): DropStreakState {
  return {
    activeObservationId: null,
    activeSpawnEventId: null,
    caughtObservationIds: [],
    evidenceEventIds: [],
    resolvedObservationIds: []
  };
}

function observationId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function rememberResolved(state: DropStreakState, id: string): string[] {
  return [...new Set([...state.resolvedObservationIds, id])]
    .slice(-MAX_RESOLVED_OBSERVATIONS);
}

function resetStreak(
  state: DropStreakState,
  resolvedObservationIds = state.resolvedObservationIds
): DropStreakState {
  return {
    activeObservationId: null,
    activeSpawnEventId: null,
    caughtObservationIds: [],
    evidenceEventIds: [],
    resolvedObservationIds
  };
}

/**
 * Counts only a confirmed own claim correlated to one previously observed
 * spawn. Any unresolved, missed or out-of-order boundary fails closed and
 * clears the consecutive streak.
 */
export const dropStreakDefinition: ChallengeDefinition<
  DropStreakState,
  DropStreakParameters
> = {
  id: 'drop-streak',
  version: 1,
  metadata: {
    category: 'lucky-fun',
    localization: localization(
      'Drop Streak',
      'Catch 5 consecutively spawned Typo drops without missing one.',
      'Drop Streak',
      'Fange 5 nacheinander gespawnte Typo-Drops, ohne einen zu verpassen.'
    ),
    icon: 'drop-streak-catches',
    rankedEligible: false,
    difficulty: 5
  },
  defaultParameters: {
    catches: 5
  },
  target: parameters => parameters.catches,
  createInitialState: initialState,
  validateParameters(value): value is DropStreakParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<DropStreakParameters>).catches);
  },
  relevantEvents: [
    'TYPO_DROP_SPAWNED',
    'TYPO_DROP_MISSED',
    'TYPO_DROP_CLAIMED'
  ],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    const state = runtime.internalState;

    if (event.type === 'TYPO_DROP_SPAWNED') {
      const id = observationId(event.payload.dropObservationId);
      if (id === null || state.resolvedObservationIds.includes(id)) return null;
      if (state.activeObservationId === id) return null;

      const replacedUnresolvedDrop = state.activeObservationId !== null;
      const resolved = replacedUnresolvedDrop
        ? rememberResolved(state, state.activeObservationId as string)
        : state.resolvedObservationIds;
      const base = replacedUnresolvedDrop ? resetStreak(state, resolved) : state;

      return {
        internalState: {
          ...base,
          activeObservationId: id,
          activeSpawnEventId: event.eventId
        },
        progress: replacedUnresolvedDrop ? 0 : runtime.progress.current,
        reason: replacedUnresolvedDrop
          ? 'drop-streak-reset-by-replaced-unresolved-drop'
          : 'drop-streak-spawn-observed'
      };
    }

    if (event.type === 'TYPO_DROP_MISSED') {
      const id = observationId(event.payload.dropObservationId);
      if (id === null || state.resolvedObservationIds.includes(id)) return null;
      const resolved = rememberResolved(state, id);
      if (state.activeObservationId !== null && state.activeObservationId !== id) {
        resolved.push(...rememberResolved(state, state.activeObservationId));
      }

      return {
        internalState: resetStreak(state, [...new Set(resolved)].slice(-MAX_RESOLVED_OBSERVATIONS)),
        progress: 0,
        reason: `drop-streak-reset-by-${event.payload.reason}`,
        evidenceEventIds: [event.eventId]
      };
    }

    if (event.type !== 'TYPO_DROP_CLAIMED' || !event.payload.own) return null;
    const id = observationId(event.payload.dropObservationId);
    if (id !== null && state.resolvedObservationIds.includes(id)) return null;
    if (id === null) {
      if (runtime.progress.current === 0 && state.activeObservationId === null) return null;
      return {
        internalState: resetStreak(state),
        progress: 0,
        reason: 'drop-streak-reset-by-uncorrelated-claim',
        evidenceEventIds: [event.eventId]
      };
    }

    if (state.activeObservationId !== id || state.activeSpawnEventId === null) {
      const resolved = state.activeObservationId === null
        ? state.resolvedObservationIds
        : rememberResolved(state, state.activeObservationId);
      return {
        internalState: resetStreak(state, resolved),
        progress: 0,
        reason: 'drop-streak-reset-by-out-of-order-claim',
        evidenceEventIds: [event.eventId]
      };
    }

    const nextCount = state.caughtObservationIds.length + 1;
    const nextEvidence = [
      ...state.evidenceEventIds,
      state.activeSpawnEventId,
      event.eventId
    ];
    const nextState: DropStreakState = {
      activeObservationId: null,
      activeSpawnEventId: null,
      caughtObservationIds: [...state.caughtObservationIds, id],
      evidenceEventIds: nextEvidence,
      resolvedObservationIds: rememberResolved(state, id)
    };

    return {
      internalState: nextState,
      progress: nextCount,
      complete: nextCount >= parameters.catches,
      reason: nextCount >= parameters.catches
        ? 'drop-streak-five-correlated-catches-completed'
        : 'drop-streak-correlated-catch-counted',
      evidenceEventIds: nextEvidence
    };
  }
};
