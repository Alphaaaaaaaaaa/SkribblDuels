import type { ChallengeLocalization } from '@skribbl-duels/challenge-engine';

export interface CountParameters {
  amount: number;
}

export interface CounterState {
  qualifyingEvents: number;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function nextCounter(current: CounterState): CounterState {
  return {
    qualifyingEvents: current.qualifyingEvents + 1
  };
}

export function localization(
  enName: string,
  enDescription: string,
  deName: string,
  deDescription: string
): Record<string, ChallengeLocalization> {
  return {
    en: {
      name: enName,
      description: enDescription
    },
    de: {
      name: deName,
      description: deDescription
    }
  };
}

export function countVisibleCharacters(value: string): number {
  return Array.from(value.trim()).length;
}
