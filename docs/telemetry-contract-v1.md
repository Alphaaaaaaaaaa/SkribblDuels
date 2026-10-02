# Skribbl Duels Telemetry Contract v1

## Boundary

Challenge code may import `@skribbl-duels/telemetry-contracts` only. It must not import socket packet IDs, Typo relay classes, DOM selectors, protocol decoders or the canonical reducer.

## Versioning

- Contract version: `1.2.0`
- Event schema version: `1`
- Adding an optional payload field is backwards-compatible.
- Removing a field, changing its type or changing the meaning/timing of an event requires a contract version bump.
- v1.2 adds `LOBBY_LEFT` with `{ method: 'duels-socket', reason }` for native
  socket departures. Consumers close lobby-scoped observation; the protocol
  state store clears after the departure event has captured its old context.
- The replay reader accepts stored v1.1 fixtures as well as v1.2. Schema 1 is
  unchanged; Gateway wire versioning is a separate contract.

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
- v0.72.0 provides independent Skribbl telemetry. Only definitions requiring
  Typo-specific Challenges, Drops or Image Lab retain those capability gates.
