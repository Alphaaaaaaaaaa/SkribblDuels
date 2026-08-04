# Challenge Definitions v0.5.0

## Fanboy

Like three different drawings in public lobbies.

Rules:

- Uses the local `VOTE_SUBMITTED` telemetry event.
- Only vote value `1` (`LIKE`) counts.
- Each `roundSessionId` can count once.
- Dislikes, duplicate likes and votes during the local player's own drawing turn are ignored.
- Progress is cumulative and is not reset by a lobby change.
- Default target: `3`.
