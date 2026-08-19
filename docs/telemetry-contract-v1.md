# Skribbl Duels Telemetry Contract v1

## Boundary

Challenge code may import `@skribbl-duels/telemetry-contracts` only. It must not import socket packet IDs, Typo relay classes, DOM selectors, protocol decoders or the canonical reducer.

## Versioning

- Contract version: `1.0.0`
- Event schema version: `1`
- Adding an optional payload field is backwards-compatible.
- Removing a field, changing its type or changing the meaning/timing of an event requires a contract version bump.

## Round identity

- `roundIndex`: raw zero-based skribbl value.
- `roundNumber`: one-based value for users and challenges.
- `gameSessionId`: stable local identity for a complete game.
- `roundSessionId`: stable local identity for a drawing/guessing round.

Challenge streaks and per-round sets must use `roundSessionId`, not just `roundNumber`.

## Public-lobby rule

Challenge definitions can require:

```ts
event.context.lobbyType === 0
```

All initial challenges require a public lobby except `Owner of the Lobby`.

## Visibility

The Telemetry Inspector is a development app. The production Skribbl Duels app will not mount or bundle its visible debug panel.

## Current product decisions

- `Caught in 4k`: complete only when the local player has the highest final score and at least 4000 points. A tied highest score counts as a shared win.
- `Mogged`: only previous chat messages that exactly match a word in the active official word list are eligible as wrong-word attempts.
- `Ultimate Comeback`: if the target player leaves, the opportunity may become impossible; no replacement target is guaranteed.
- Opponents see field status only, never exact progress.
- A challenge appears at most once per board.
- Typo remains a permanent prerequisite.
