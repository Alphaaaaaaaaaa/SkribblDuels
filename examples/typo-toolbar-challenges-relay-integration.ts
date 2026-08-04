/*
 * Integration example for:
 * src/app/features/toolbar-challenges/toolbar-challenges.feature.ts
 *
 * The relay reports selection changes separately from the temporary visual/gameplay
 * effect. This lets Skribbl Duels distinguish a normal effect shutdown after a
 * correct guess from manually disabling a Typo challenge before the guess resolves.
 */

import type { TypoChallenge } from '@/app/features/toolbar-challenges/challenge';

const SKRIBBL_DUELS_TYPO_CHALLENGE_EVENT = 'skribbl-duels:typo-challenge-state';

const challengeKeys: Record<number, string> = {
  1: 'blind-guess',
  2: 'drunk-vision',
  3: 'deaf-guess',
  4: 'one-shot',
  5: 'dont-clear',
  6: 'monochrome'
};

type RelayReason =
  | 'selection-changed'
  | 'trigger-applied'
  | 'challenge-destroyed'
  | 'feature-destroyed';

interface RelayState {
  challengeId: number;
  challengeKey: string;
  challengeName: string;
  selected: boolean;
  effectActive: boolean;
  featureActive: boolean;
  reason: RelayReason;
}

function dispatchTypoChallengeState(state: RelayState): void {
  window.dispatchEvent(new CustomEvent(SKRIBBL_DUELS_TYPO_CHALLENGE_EVENT, {
    detail: state
  }));
}

/* Add these fields to ToolbarChallengesFeature. */
private readonly _selectedChallengeIds = new Set<number>();
private readonly _effectStates = new Map<number, boolean>();
private _challengeRelayFeatureActive = false;

private emitChallengeRelayState(
  id: number,
  challenge: TypoChallenge<unknown>,
  reason: RelayReason,
  selected = this._selectedChallengeIds.has(id),
  effectActive = this._effectStates.get(id) === true,
  featureActive = this._challengeRelayFeatureActive
): void {
  dispatchTypoChallengeState({
    challengeId: id,
    challengeKey: challengeKeys[id] ?? `challenge-${id}`,
    challengeName: challenge.name,
    selected,
    effectActive,
    featureActive,
    reason
  });
}

/* Set this near the beginning of onActivate(). */
this._challengeRelayFeatureActive = true;

/*
 * Replace the activation part inside listenChallengeStates() with this pattern.
 * Passing the numeric ID into activateChallenge is important.
 */
ids.forEach(id => {
  const state = this._challengeStates.get(id);
  if (!state) return;

  this._selectedChallengeIds.add(id);
  this.emitChallengeRelayState(id, state.challenge, 'selection-changed', true);

  if (!state.destroy) {
    state.destroy = this.activateChallenge(id, state.challenge);
  }
});

/* Replace the deactivation loop with this pattern. */
this._challengeStates.forEach((state, id) => {
  if (ids.includes(id) || !state.destroy) return;

  this._selectedChallengeIds.delete(id);
  state.destroy();
  state.destroy = undefined;
  this._effectStates.set(id, false);
  this.emitChallengeRelayState(
    id,
    state.challenge,
    'selection-changed',
    false,
    false
  );
});

/* Replace activateChallenge() with the ID-aware form below. */
private activateChallenge(
  id: number,
  challenge: TypoChallenge<unknown>
): VoidFunction {
  const triggerSubject = challenge.createTriggerObservable();
  let disposed = false;

  const subscription = triggerSubject.subscribe(async trigger => {
    try {
      await challenge.apply(trigger);

      /* Ignore an async apply() result that finished after manual deactivation. */
      if (disposed || !this._selectedChallengeIds.has(id)) {
        await challenge.destroy();
        return;
      }

      this._effectStates.set(id, Boolean(trigger));
      this.emitChallengeRelayState(
        id,
        challenge,
        'trigger-applied',
        true,
        Boolean(trigger)
      );
    }
    catch (error) {
      this._logger.error(`Error applying challenge: ${error}`);
    }
  });

  return () => {
    disposed = true;
    subscription.unsubscribe();
    try {
      challenge.destroy();
    }
    catch (error) {
      this._logger.error(`Error destroying challenge: ${error}`);
    }
    this._effectStates.set(id, false);
  };
}

/*
 * Add this cleanup before _challengeStates.clear() in onDestroy(). It also fixes
 * active challenge effects surviving destruction of the complete Typo feature.
 */
this._challengeRelayFeatureActive = false;
this._challengeStates.forEach((state, id) => {
  this._selectedChallengeIds.delete(id);
  state.destroy?.();
  state.destroy = undefined;
  this._effectStates.set(id, false);
  this.emitChallengeRelayState(
    id,
    state.challenge,
    'feature-destroyed',
    false,
    false,
    false
  );
});
