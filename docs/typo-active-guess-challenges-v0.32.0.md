# Typo active-guess challenges — v0.32.0

This version adds three Skribbl Duels challenges:

- Blind Guess
- Drunk Vision
- Deaf Guess

A challenge completes only when the matching Typo effect was observed in the current foreign drawing turn, the user's submitted guess was sent while that effect was active, and the following server event confirms the guess was correct.

## Normalized events

### `TYPO_CHALLENGE_STATE_CHANGED`

Tracks these dimensions separately:

- `selected`: whether the checkbox is enabled
- `effectActive`: whether `apply(true)` currently affects the game
- `featureActive`: whether the complete Typo Challenges feature is alive
- `reason`: selection, trigger, challenge destruction, feature destruction, or DOM fallback

This distinction is important because `apply(false)` after a successful guess is normal and must not be confused with manually disabling the checkbox.

### `TYPO_CHALLENGE_GUESS_ATTEMPT`

Created for every outgoing self guess. It records the effects visible at the exact submission moment and the directly selected challenges known through the relay.

## Disable protection

With the direct Typo relay installed, all of the following invalidate the current turn:

- unchecking the matching challenge before the correct guess resolves
- disabling the complete Typo Challenges feature
- disabling and re-enabling the challenge during the same turn
- submitting the guess while the visual/gameplay effect is not active

The automatic DOM fallback detects the existing Blind Guess canvas opacity, Drunk Vision blur overlay, and Deaf Guess hidden hints/chat styling. It permits testing without rebuilding Typo, but the direct relay is the authoritative mode for race-free selection/deactivation detection.

## Typo source integration

See `examples/typo-toolbar-challenges-relay-integration.ts`. The relay is emitted from `ToolbarChallengesFeature`, because this class owns both the selected ID list and the lifecycle calls to `apply()` and `destroy()`.
