# Challenge Definitions v0.2

## Quickscope'd v2

A correct guess only qualifies when the challenge instance observed a `ROUND_STARTED`
event for the same `roundSessionId` first. This prevents players from joining an
already-running lobby round and immediately completing Quickscope from an advanced
drawing.

Completion evidence contains both:

- the fresh `ROUND_STARTED` event;
- the qualifying self `CORRECT_GUESS` event.

A lobby change clears the eligible round state.

## Ouch v1

Ouch is completed when all of the following are true:

1. The client observed `ROUND_STARTED` for the round.
2. The client observed `FIRST_GUESS` and recorded its `elapsedMs`.
3. The local player is not the first guesser.
4. The local player's `CORRECT_GUESS.elapsedMs` is between 0 and 500 ms after the
   first-guesser time.
5. The events belong to the same public-lobby `roundSessionId`.

If the player joins after the first guesser, the challenge cannot complete in that
round because the required baseline evidence is absent.
