# Typo active-guess challenges — v0.32.1

## Root cause from live telemetry

The Deaf Guess attempt for `Pasta` contained `activeChallengeKeys: ['deaf-guess']`, but no per-round `TYPO_CHALLENGE_STATE_CHANGED` event had been emitted because the effect was already active before the round snapshot. The old reducer required both events and rejected the correct guess.

The Blind Guess attempt for `Goldfisch` contained only `deaf-guess`. The old selector queried a single canvas and did not necessarily resolve the canvas modified by Typo's `ElementsSetup`.

The Deaf fallback also used generic hint/character opacity, which caused false positives in unrelated challenge turns.

## v0.32.1 behavior

- `ROUND_STARTED` forces a fresh DOM snapshot.
- `GUESS_SUBMITTED` forces another synchronous snapshot before `TYPO_CHALLENGE_GUESS_ATTEMPT`.
- A fallback guess-attempt listing the challenge as active is sufficient effect evidence for that turn.
- Blind Guess checks all likely game canvas selectors and prioritizes explicit inline opacity.
- Deaf Guess checks Typo's dedicated stylesheet marker instead of generic hidden UI.
- A true→false DOM transition during the same turn disqualifies that challenge, even if it is later re-enabled.
