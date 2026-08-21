# Challenge Definitions 0.9.0

## Caught in 4k v3

Completes only on `GAME_ENDED` when the local player:

1. has at least 4000 points, and
2. has the highest score in `GAME_ENDED.payload.finalScores`.

A tied highest score counts as a shared win. A second-place score of 4000 or more does not qualify.

## Owner of the Lobby

Completes after a locally observed `PRIVATE_LOBBY_CREATE_REQUESTED` is followed by `PRIVATE_LOBBY_READY` within 60 seconds. Joining another player's private lobby does not qualify because no local create request exists. This is the only initial challenge intended for a private lobby.

## My favorite color is Red

Completes when all three steps are observed in order:

1. `AVATAR_RANDOMIZED` reports a red skin (`avatar[0] === 0`),
2. `RED_AVATAR_LOGIN_CONFIRMED` confirms login with that same avatar, and
3. `LOBBY_HYDRATED` confirms entry into a public lobby.

The telemetry core now includes a lightweight homepage adapter that watches the `ava` localStorage entry and emits `AVATAR_RANDOMIZED` only when the stored avatar actually changes.
