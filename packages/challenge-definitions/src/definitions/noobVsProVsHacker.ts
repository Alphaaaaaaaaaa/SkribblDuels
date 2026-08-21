import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { isPositiveInteger, localization } from '../shared';

export interface NoobVsProVsHackerParameters {
  minimumPosition: number;
  maximumPosition: number;
}

export interface NoobVsProVsHackerState {
  collectedPositions: number[];
  evidenceByPosition: Record<string, string>;
}

function normalizeCollectedPositions(
  values: readonly unknown[],
  minimumPosition: number,
  maximumPosition: number
): number[] {
  const positions = new Set<number>();
  for (const value of values) {
    const position = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(position)) continue;
    if (position < minimumPosition || position > maximumPosition) continue;
    positions.add(position);
  }
  return [...positions].sort((left, right) => left - right);
}

function evidenceForPositions(
  positions: readonly number[],
  evidenceByPosition: Readonly<Record<string, string>>
): string[] {
  return positions
    .map(position => evidenceByPosition[String(position)])
    .filter((eventId): eventId is string => typeof eventId === 'string');
}

export const noobVsProVsHackerDefinition: ChallengeDefinition<
  NoobVsProVsHackerState,
  NoobVsProVsHackerParameters
> = {
  id: 'noob-vs-pro-vs-hacker',
  version: 2,
  metadata: {
    category: 'guessing',
    localization: localization(
      'Noob vs. Pro vs. Hacker',
      'Correctly guess a word in every guessing position from first through seventh.',
      'Noob vs. Pro vs. Hacker',
      'Errate ein Wort auf jeder Rateposition vom ersten bis zum siebten Platz.'
    ),
    icon: 'noob-pro-hacker-positions',
    rankedEligible: true,
    difficulty: 5
  },
  defaultParameters: {
    minimumPosition: 1,
    maximumPosition: 7
  },
  target: parameters => parameters.maximumPosition - parameters.minimumPosition + 1,
  createInitialState: () => ({
    collectedPositions: [],
    evidenceByPosition: {}
  }),
  validateParameters(value): value is NoobVsProVsHackerParameters {
    if (typeof value !== 'object' || value === null) return false;
    const parameters = value as Partial<NoobVsProVsHackerParameters>;
    return isPositiveInteger(parameters.minimumPosition)
      && isPositiveInteger(parameters.maximumPosition)
      && Number(parameters.maximumPosition) >= Number(parameters.minimumPosition);
  },
  relevantEvents: ['CORRECT_GUESS'],
  allowedLobbyTypes: [0],
  reduce({ event, runtime, parameters }) {
    if (event.type !== 'CORRECT_GUESS') return null;
    if (!event.actor?.isSelf) return null;

    const position = event.payload.position;
    if (position === null || !Number.isInteger(position)) return null;
    if (position < parameters.minimumPosition || position > parameters.maximumPosition) return null;

    // Normalize persisted/runtime state on every event. This also repairs snapshots from
    // older builds where a position could be represented as a string or duplicated.
    const collectedPositions = normalizeCollectedPositions(
      runtime.internalState.collectedPositions,
      parameters.minimumPosition,
      parameters.maximumPosition
    );
    const evidenceByPosition: Record<string, string> = {
      ...runtime.internalState.evidenceByPosition
    };
    const alreadyCollected = collectedPositions.includes(position);

    if (!alreadyCollected) {
      collectedPositions.push(position);
      collectedPositions.sort((left, right) => left - right);
      evidenceByPosition[String(position)] = event.eventId;
    }

    const target = parameters.maximumPosition - parameters.minimumPosition + 1;
    return {
      internalState: {
        collectedPositions,
        evidenceByPosition
      },
      progress: collectedPositions.length,
      complete: collectedPositions.length >= target,
      reason: alreadyCollected
        ? `guess-position-${position}-already-collected`
        : `guess-position-${position}-collected`,
      evidenceEventIds: evidenceForPositions(collectedPositions, evidenceByPosition)
    };
  }
};
