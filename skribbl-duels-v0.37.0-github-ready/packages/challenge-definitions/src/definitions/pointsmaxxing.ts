import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isFinitePositiveNumber, localization } from '../shared';

export interface PointsmaxxingParameters {
  points: number;
}

export interface PointsmaxxingState {
  qualifyingEvents: number;
  currentRoundSessionId: string | null;
  roundStartEventId: string | null;
  ownDrawingActive: boolean;
  selfPlayerId: number | null;
  latestRoundScore: number | null;
}

function emptyState(): PointsmaxxingState {
  return {
    qualifyingEvents: 0,
    currentRoundSessionId: null,
    roundStartEventId: null,
    ownDrawingActive: false,
    selfPlayerId: null,
    latestRoundScore: null
  };
}

export const pointsmaxxingDefinition: ChallengeDefinition<PointsmaxxingState, PointsmaxxingParameters> = {
  id: 'pointsmaxxing',
  version: 1,
  metadata: {
    category: 'drawing',
    localization: localization(
      'Pointsmaxxing',
      'Earn more than 450 round points for one of your own drawings in a public lobby.',
      'Pointsmaxxing',
      'Erhalte in einer öffentlichen Lobby mehr als 450 Rundenpunkte für eine deiner eigenen Zeichnungen.'
    ),
    icon: 'pointsmaxxing-score',
    rankedEligible: true,
    difficulty: 4
  },
  defaultParameters: {
    points: 450
  },
  target: () => 1,
  createInitialState: emptyState,
  validateParameters(value): value is PointsmaxxingParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isFinitePositiveNumber((value as Partial<PointsmaxxingParameters>).points);
  },
  relevantEvents: ['ROUND_STARTED', 'ROUND_ENDED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'ROUND_STARTED') {
      const roundSessionId = event.context.roundSessionId;
      const selfPlayerId = event.context.meId;
      if (roundSessionId === null || selfPlayerId === null) return null;
      const ownDrawingActive = event.context.drawerId === selfPlayerId;
      return {
        internalState: {
          ...emptyState(),
          currentRoundSessionId: roundSessionId,
          roundStartEventId: event.eventId,
          ownDrawingActive,
          selfPlayerId
        },
        progress: 0,
        reason: ownDrawingActive
          ? 'pointsmaxxing-own-drawing-started'
          : 'pointsmaxxing-foreign-drawing-skipped'
      };
    }

    if (event.type !== 'ROUND_ENDED') return null;
    const state = runtime.internalState;
    if (!state.ownDrawingActive || state.selfPlayerId === null) return null;
    if (event.context.roundSessionId === null || event.context.roundSessionId !== state.currentRoundSessionId) return null;
    const ownScore = event.payload.scores.find(score => score.playerId === state.selfPlayerId)?.roundScore ?? null;
    if (ownScore === null || !Number.isFinite(ownScore)) {
      return {
        internalState: emptyState(),
        progress: 0,
        reason: 'pointsmaxxing-round-score-unavailable',
        evidenceEventIds: [event.eventId]
      };
    }
    const qualifies = ownScore > parameters.points;
    const evidenceEventIds = [
      ...(state.roundStartEventId ? [state.roundStartEventId] : []),
      event.eventId
    ];
    return {
      internalState: {
        ...emptyState(),
        qualifyingEvents: qualifies ? 1 : 0,
        latestRoundScore: ownScore
      },
      progress: qualifies ? 1 : 0,
      complete: qualifies,
      reason: qualifies
        ? 'pointsmaxxing-own-drawing-scored-above-threshold'
        : 'pointsmaxxing-own-drawing-did-not-exceed-threshold',
      evidenceEventIds
    };
  }
};
