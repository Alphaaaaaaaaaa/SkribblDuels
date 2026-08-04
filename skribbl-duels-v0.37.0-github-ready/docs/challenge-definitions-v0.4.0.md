# Challenge Definitions v0.4.0

## OMG Hacker?!?!?

Challenge ID: `omg-hacker`  
Definition version: `1`  
Default target: `5` first guesses

A turn qualifies when the local player is the actor of the definitive `FIRST_GUESS` event. The challenge does not require a clean first attempt; prior wrong attempts are allowed.

The complete streak resets when:

- another player emits `FIRST_GUESS` in an eligible guessing turn;
- an eligible guessing turn ends normally without the local player being first;
- the next eligible turn begins while the previous eligible turn was unresolved;
- the lobby changes while the instance is active.

The streak is preserved when:

- the local player is the drawer;
- the active drawer leaves, is kicked or is banned and the turn is interrupted.

A turn only participates after its `ROUND_STARTED` event was observed, preventing mid-turn joins from counting.
