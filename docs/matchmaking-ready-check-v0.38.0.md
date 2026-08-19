# Matchmaking and Ready Check v0.38.0

## Lifecycle ownership

Only one userscript runtime, one Gateway connection and one active match flow
may own the page for an account. A new runtime disposes the previous v0.38+
runtime. Legacy panels, launchers and boards are hidden and removed by runtime
ID. Match and challenge persistence use a new generation so v0.37.x cannot
restore stale state into v0.38.0.

Every demo or queue start clears the current board, local match state, Duel
messages, injected completion rows, telemetry match counters and persisted
session before creating the next lifecycle. A new server queue request cancels
the account's previous queue, ready check or pending draft first.

## Homepage queue

The UI enables Casual and Ranked queue buttons only when `/` is active and the
visible `#home` element is present. The Contract v1 `MATCHMAKING_JOIN` message
also declares `page: 'home'`. Queue membership and opponent identity are held by
the Gateway rather than local browser state.

The queue supports real authenticated peers. For development,
`MATCHMAKING_SIMULATED_PLAYERS=true` adds a server-created opponent after a short
delay when no real second player is available.

## Ready check

When two participants are paired, the Gateway sends a versioned
`MATCH_SNAPSHOT` in `ready-check` phase. Both participants receive the same
deadline exactly 30 seconds after match creation. Explicit leave, disconnect,
timeout or a new matchmaking request cancels the match for both sides.

After both players are ready, the server moves the snapshot to `draft` and
clears the deadline. It also selects the future draft starter randomly. The
actual alternating draft and its 15-second selection timer are intentionally
the next milestone.
