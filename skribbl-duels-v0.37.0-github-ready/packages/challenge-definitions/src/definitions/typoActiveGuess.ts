import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import { localization } from '../shared';

export interface TypoActiveGuessState {
  selected: boolean | null;
  featureActive: boolean | null;
  effectActive: boolean;
  roundSessionId: string | null;
  effectObservedThisRound: boolean;
  disabledDuringRound: boolean;
  effectEventId: string | null;
  guessAttemptEventId: string | null;
  sourceGuessEventId: string | null;
  guessAttemptAtMonotonicMs: number | null;
}

interface TypoActiveGuessConfig {
  id: 'blind-guess' | 'drunk-vision' | 'deaf-guess';
  name: string;
  descriptionEn: string;
  descriptionDe: string;
  icon: string;
  difficulty: number;
}

function initialState(): TypoActiveGuessState {
  return {
    selected: null,
    featureActive: null,
    effectActive: false,
    roundSessionId: null,
    effectObservedThisRound: false,
    disabledDuringRound: false,
    effectEventId: null,
    guessAttemptEventId: null,
    sourceGuessEventId: null,
    guessAttemptAtMonotonicMs: null
  };
}

function roundState(
  current: TypoActiveGuessState,
  roundSessionId: string | null
): TypoActiveGuessState {
  return {
    ...current,
    effectActive: false,
    roundSessionId,
    effectObservedThisRound: false,
    disabledDuringRound: false,
    effectEventId: null,
    guessAttemptEventId: null,
    sourceGuessEventId: null,
    guessAttemptAtMonotonicMs: null
  };
}

export function createTypoActiveGuessDefinition(
  config: TypoActiveGuessConfig
): ChallengeDefinition<TypoActiveGuessState, Record<string, never>> {
  return {
    id: config.id,
    version: 2,
    metadata: {
      category: 'guessing',
      localization: localization(
        config.name,
        config.descriptionEn,
        config.name,
        config.descriptionDe
      ),
      icon: config.icon,
      rankedEligible: true,
      difficulty: config.difficulty
    },
    defaultParameters: {},
    target: () => 1,
    createInitialState: initialState,
    relevantEvents: [
      'ROUND_STARTED',
      'TYPO_CHALLENGE_STATE_CHANGED',
      'TYPO_CHALLENGE_GUESS_ATTEMPT',
      'CORRECT_GUESS'
    ],
    allowedLobbyTypes: [0],
    resetOn: ['lobby-change'],
    reduce({ event, runtime }) {
      const current = runtime.internalState;

      if (event.type === 'ROUND_STARTED') {
        const selfId = event.context.meId;
        const isOwnDrawing = selfId !== null && event.context.drawerId === selfId;
        return {
          internalState: roundState(current, isOwnDrawing ? null : event.context.roundSessionId),
          reason: isOwnDrawing
            ? `${config.id}-own-drawing-skipped`
            : `${config.id}-round-started`
        };
      }

      if (event.type === 'TYPO_CHALLENGE_STATE_CHANGED') {
        if (event.payload.challengeKey !== config.id) return null;

        const selected = event.payload.selected ?? current.selected;
        const featureActive = event.payload.featureActive ?? current.featureActive;
        const selectedWasEnabled = current.selected === true || current.effectActive;
        const featureWasEnabled = current.featureActive === true || current.effectActive;
        const explicitSelectionDisable = event.payload.method === 'typo-relay'
          && event.payload.selected === false
          && selectedWasEnabled;
        const explicitFeatureDisable = event.payload.method === 'typo-relay'
          && event.payload.featureActive === false
          && featureWasEnabled;
        const sameRound = current.roundSessionId !== null
          && event.context.roundSessionId === current.roundSessionId;
        const fallbackEffectDisable = event.payload.method === 'dom-fallback'
          && sameRound
          && current.effectActive
          && event.payload.effectActive === false;
        const effectObserved = sameRound
          && event.payload.effectActive
          && event.payload.selected !== false
          && event.payload.featureActive !== false;
        const disabledDuringRound = current.disabledDuringRound
          || (sameRound && (explicitSelectionDisable || explicitFeatureDisable || fallbackEffectDisable));

        return {
          internalState: {
            ...current,
            selected,
            featureActive,
            effectActive: event.payload.effectActive,
            effectObservedThisRound: current.effectObservedThisRound || effectObserved,
            disabledDuringRound,
            effectEventId: effectObserved ? event.eventId : current.effectEventId,
            guessAttemptEventId: disabledDuringRound ? null : current.guessAttemptEventId,
            sourceGuessEventId: disabledDuringRound ? null : current.sourceGuessEventId,
            guessAttemptAtMonotonicMs: disabledDuringRound
              ? null
              : current.guessAttemptAtMonotonicMs
          },
          reason: disabledDuringRound
            ? `${config.id}-disabled-during-turn`
            : effectObserved
              ? `${config.id}-effect-observed`
              : `${config.id}-state-updated`,
          evidenceEventIds: [event.eventId]
        };
      }

      if (event.type === 'TYPO_CHALLENGE_GUESS_ATTEMPT') {
        if (current.roundSessionId === null) return null;
        if (event.context.roundSessionId !== current.roundSessionId) return null;
        if (current.disabledDuringRound) return null;
        if (!event.payload.activeChallengeKeys.includes(config.id)) return null;
        if (current.selected === false || current.featureActive === false) return null;
        if (
          event.payload.method !== 'dom-fallback'
          && !event.payload.selectedChallengeKeys.includes(config.id)
        ) return null;

        // A synchronous DOM snapshot at GUESS_SUBMITTED is itself sufficient
        // evidence that the effect was active. This also covers effects that
        // were already active before ROUND_STARTED and therefore emitted no
        // earlier mutation-based state change.
        return {
          internalState: {
            ...current,
            effectActive: true,
            effectObservedThisRound: true,
            effectEventId: current.effectEventId ?? event.eventId,
            guessAttemptEventId: event.eventId,
            sourceGuessEventId: event.payload.sourceGuessEventId,
            guessAttemptAtMonotonicMs: event.monotonicMs
          },
          reason: `${config.id}-guess-attempt-under-effect`,
          evidenceEventIds: [event.eventId]
        };
      }

      if (event.type !== 'CORRECT_GUESS') return null;
      if (!event.actor?.isSelf) return null;
      if (current.roundSessionId === null) return null;
      if (event.context.roundSessionId !== current.roundSessionId) return null;
      if (current.disabledDuringRound || !current.effectObservedThisRound) return null;
      if (current.selected === false || current.featureActive === false) return null;
      if (current.guessAttemptEventId === null || current.guessAttemptAtMonotonicMs === null) return null;
      const responseDelayMs = event.monotonicMs - current.guessAttemptAtMonotonicMs;
      if (responseDelayMs < 0 || responseDelayMs > 5000) return null;

      const evidenceEventIds = [
        current.effectEventId,
        current.guessAttemptEventId,
        event.eventId
      ].filter((value): value is string => value !== null);

      return {
        internalState: current,
        progress: 1,
        complete: true,
        reason: `${config.id}-correct-while-typo-effect-active`,
        evidenceEventIds
      };
    }
  };
}
