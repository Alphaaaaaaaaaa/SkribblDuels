# Challenge Definitions v0.3.1

## Sniper v2

Sniper completes after the local player guesses correctly in three different freshly observed public-lobby rounds without any wrong guess during the current streak.

Rules:

1. The client must observe `ROUND_STARTED` for the exact `roundSessionId`; a mid-round lobby join cannot qualify.
2. An own `WRONG_GUESS` immediately resets the complete Sniper streak to `0/3` and disqualifies the current round.
3. `CORRECT_GUESS.payload.wrongGuessesBeforeCorrect > 0` performs the same full reset as a defensive consistency check.
4. The correct guess that follows a dirty round cannot immediately restart progress because its matching fresh-round eligibility was cleared.
5. Each `roundSessionId` can count at most once.
6. A lobby-session change or leaving the current lobby resets active Sniper progress.
7. `completion-pending`, `claimed`, `lost`, and `expired` challenge instances are not lifecycle-reset by lobby changes.
8. Completion evidence contains the `ROUND_STARTED` and qualifying `CORRECT_GUESS` event IDs for the three clean rounds after the most recent reset.

Default parameters:

```ts
{ rounds: 3 }
```

## Challenge icons

`ChallengeMetadata.icon` is an optional semantic key. The production UI can resolve values such as `sniper-crosshair` through a bundled asset registry. Challenge logic and persistence do not depend on the image format or file location.
