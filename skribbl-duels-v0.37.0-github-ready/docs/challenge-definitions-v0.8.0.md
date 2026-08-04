# Challenge Definitions 0.8.0

## Removed: Most likely

`most-likely` is no longer registered or activated. Its concept was an earlier name/variant of the retained `picasso` challenge.

## Copy + Paste v2

Completes when at least three distinct players correctly guess one local-player drawing within the first ten seconds after the corresponding `ROUND_STARTED` event.

The relevant limit is absolute elapsed time from the drawing-turn start:

```text
CORRECT_GUESS.payload.elapsedMs <= 10000
```

A cluster of guesses that occurs later in the turn does not count, even when those guesses are less than ten seconds apart from each other. Guesses from other drawing turns do not carry over. The completion evidence includes the observed `ROUND_STARTED` event and the qualifying correct guesses.

## Caught in 4k v2

Completes only on `GAME_ENDED` when the local player's final score is greater than or equal to 4000. First place is not required.

```text
finalScore >= 4000
```

`SCORE_CHANGED` only updates the candidate final score and cannot complete the challenge before the game-ending event.

## Telemetry dependency

`GAME_ENDED.payload.finalScores` is populated from the canonical lobby-user score snapshot.
