# Challenge Definitions v0.3

## Sniper v1

Sniper completes after the local player guesses correctly in three different public-lobby rounds without a previous wrong guess in each qualifying round.

Rules:

1. The client must observe `ROUND_STARTED` for the exact `roundSessionId`; a mid-round lobby join cannot qualify.
2. `WRONG_GUESS` from the local player marks only the current round as disqualified.
3. `CORRECT_GUESS.payload.wrongGuessesBeforeCorrect > 0` also disqualifies the round as a defensive consistency check.
4. A disqualified round does not reduce progress earned in earlier clean rounds.
5. Each `roundSessionId` can count at most once.
6. A lobby-session change resets all accumulated Sniper progress.
7. Completion evidence contains the `ROUND_STARTED` and qualifying `CORRECT_GUESS` event IDs for all three successful rounds.

Default parameters:

```ts
{ rounds: 3 }
```
