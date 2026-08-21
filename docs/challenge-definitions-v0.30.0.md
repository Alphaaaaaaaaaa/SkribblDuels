# Challenge definitions v0.30.0

## Deserved? v2

The challenge may begin from a mid-game `LOBBY_HYDRATED`, a `ROUND_STARTED` snapshot or a new `GAME_STARTING`. From that observation point onward, a self `FIRST_GUESS` blocks the attempt. The definition maintains the live score table and completes immediately on the `SCORE_CHANGED` event that makes the self player the sole first-place player. It does not require `GAME_ENDED` and does not require observing the beginning of the game. A detected score reset starts a fresh attempt rather than carrying the previous game's first-guesser state.

## Back to back v2

Counts consecutive `GAME_ENDED` results rather than requiring `GAME_STARTING`. Therefore the first win can come from a game joined mid-progress. Two wins must be recorded in the same lobby without a lobby change or intervening loss. A shared highest final score continues to count as a win. Duplicate final-state events for the same game session are ignored.

## Solitary

Requires a freshly observed foreign `ROUND_STARTED`. Correct guessers are collected until the matching `ROUND_ENDED`. The challenge completes only when the self player is the single collected correct guesser. It waits for round end so a later second guesser can invalidate the attempt. Own drawing turns and turns interrupted by the drawer leaving are excluded.

## Pointsmaxxing

Requires a freshly observed own drawing turn and its matching `ROUND_ENDED`. The self entry in `payload.scores` must have `roundScore > 450`. Exactly 450 does not qualify; 451 or more completes the challenge.
