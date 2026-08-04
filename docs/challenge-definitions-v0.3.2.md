# Challenge Definitions v0.3.2

## Sniper v3

Sniper is evaluated per concrete drawing turn (`roundSessionId`), not per visible server round number.

A turn counts when:

- the client observed `ROUND_STARTED` for that turn;
- the local player is not the drawer;
- the local player's first submitted attempt is accepted as a correct guess;
- guess placement is irrelevant.

The streak resets when:

- the local player makes a wrong attempt before solving; or
- a normal eligible drawing turn ends without a correct first attempt.

The following turns are skipped without changing progress:

- the local player's own drawing turn;
- a turn interrupted because the drawer left, was kicked, or was banned.

Chat after the local player has already solved the word does not affect Sniper.
