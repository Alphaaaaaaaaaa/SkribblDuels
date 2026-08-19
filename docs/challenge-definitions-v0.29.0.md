# Challenge definitions v0.29.0

## InstaLike v2

Tracks a freshly observed foreign `ROUND_STARTED` and completes when the self player submits a like (`VOTE_SUBMITTED`, vote `1`) in the same drawing turn within an inclusive `0–250 ms` window. Own drawings, dislikes, mid-turn joins and reactions at `251 ms` or later do not qualify.

## Deserved?

A complete public game must be observed from `GAME_STARTING` through `GAME_ENDED`. The definition maintains the live scoreboard and records the first event where the self player becomes the sole first-place player. It does not complete immediately because a later self `FIRST_GUESS` would violate the whole-game condition. At `GAME_ENDED`, it completes if sole first place was reached at least once, no self first guess occurred anywhere in the game, and no score reset invalidated the session. The player may finish below first place.

## Back to back

Counts fully observed public games whose `GAME_ENDED.finalScores` place the self player at the highest total score. A shared highest score counts as a win. Two consecutive wins complete the challenge. A fully observed loss, a lobby change during an active game, or a new game starting before the previous observed game ended resets the streak. Lobby changes between two already completed games do not erase the first win.
