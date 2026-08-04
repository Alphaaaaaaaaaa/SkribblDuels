# Challenge definitions v0.26.0

## Hint Reflexes

- Public lobbies only.
- Stores the latest `HINT_REVEALED` event for the current `roundSessionId`.
- Completes when the local player's `CORRECT_GUESS` arrives within `0..2000 ms` of that hint.
- A newer hint replaces the previous reaction baseline.
- A new drawing turn or lobby change clears the unfinished baseline.

## Noob vs. Pro vs. Hacker

- Public lobbies only.
- Collects unique own `CORRECT_GUESS.payload.position` values from 1 through 7.
- Progress persists across drawing turns and lobby changes during the duel.
- Duplicate positions and positions outside 1..7 are ignored.
- Completion evidence contains one correct-guess event for each collected position.

## Typo drop integration findings

The own drop path is confirmed as `DropsComponent pointerdown -> feature.claimDrop(...) -> feature.processClaim(claim, true)`. A future Typo telemetry relay should emit the server-confirmed result from `processClaim` when `ownClaim` is true. `DropClaimResultDto.catchTime` is already measured in milliseconds and `clearedDrop` identifies the claim that clears the drop.
