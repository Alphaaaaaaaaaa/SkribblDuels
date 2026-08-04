# Canonical Lobby State Reducer

Version: 0.4.0

## Hydration

Incoming packet 10 replaces the lobby snapshot and initializes:

- lobby metadata
- settings/language
- self and owner IDs
- users and scores
- current round
- embedded game state

A new `lobbySessionId` is created when the lobby code changes.

## Incremental packets

The reducer handles the following decoded packet kinds:

- `PLAYER_ADD`
- `PLAYER_REMOVE`
- `PLAYER_AVATAR_UPDATED`
- `PLAYER_NAME_UPDATED`
- `VOTE_RECEIVED`
- `GAME_STATE_UPDATE`
- `ROOM_SETTING_UPDATED`
- `HINT_REVEALED`
- `TIME_UPDATED`
- `PLAYER_GUESSED`
- `CLOSE_WORD`
- `OWNER_UPDATED`
- `DRAW_COMMANDS_RECEIVED`
- `CANVAS_CLEARED`
- `UNDO_RECEIVED`
- `TEXT_RECEIVED`
- selected outgoing packets needed for correlation

## Clock model

Game-state packets and packet 14 provide clock anchors, not a continuous stream of every displayed second.

The state stores:

```text
serverTime
serverTimeAnchorMonotonicMs
```

Estimated time is:

```text
max(0, serverTime - elapsedMonotonicSeconds)
```

When packet 14 reduces the timer to 32, the reducer also stores the estimated time immediately before the reduction. This preserves useful scoring telemetry even though packet 14 arrives just before packet 15.

## Guess timing

A guess records:

- player ID
- position
- monotonic timestamp
- elapsed milliseconds since State 4 began
- estimated server time at the guess
- whether the packet included the revealed word

## Round scores

State 5 score triples update each known player's:

```text
total score
last round score
```

Each changed total emits `PLAYER_SCORE_CHANGED`.

## Draw traffic

Packet 19 updates only:

- `drawCommandCount`
- `drawPacketCount`
- `canvasRevision`

It does not append raw commands to canonical state. Raw commands remain in IndexedDB and are omitted from exports by default.

## Round numbering

The server value is stored as `serverRoundIndex`. The public `round` field is one-based.

```text
serverRoundIndex 0 -> round 1
serverRoundIndex 2 -> round 3
```

Per-round player flags (`guessed`, `wrongGuessCount`, `lastRoundScore`, `vote`) are reset when a new game/round transition enters state 1, 2 or 3.
