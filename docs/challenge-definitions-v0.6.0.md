# Challenge Definitions v0.6.0

## In and out

- Public lobbies only.
- Observe the same player joining and later leaving.
- Three distinct completed join/leave pairs are required.
- A player who was already present when tracking began and merely leaves does not count.
- Duplicate join or leave events do not count twice.
- Active progress resets when the lobby changes; pending or claimed fields remain preserved by the engine.

## Picasso

- Public lobbies only.
- The local player must be the active drawer.
- Three unique players must currently have a positive vote on the same drawing turn.
- Repeated likes from the same player count once.
- A later dislike removes that player's like before completion.
- A liker leaving before completion removes that like.
- Likes never accumulate across separate drawings.
- Active progress resets when the lobby changes; pending or claimed fields remain preserved by the engine.
