# Synchronized Match Start v0.40.0

## Authoritative transition

The final accepted draft pick closes the draft and preserves its validated
board snapshot. The Gateway then changes the match to `countdown`, publishes
`countdownEndsAt` and starts one server-owned 10-second timer. Both participants
receive the same absolute timestamp and revision.

When that timestamp is reached, the Gateway changes the match to `running`,
sets `startedAt` to the previously published countdown end and broadcasts a new
snapshot. Timer scheduling delay therefore cannot create a different official
start time.

The versioned event order is:

1. `DRAFT_COMPLETED`
2. `MATCH_COUNTDOWN_STARTED`
3. `MATCH_STARTED`

Aborting, disconnecting or beginning new matchmaking clears the pending timer
and removes the authoritative match just like the earlier ready and draft
timers.

## Browser behavior

The client validates the Gateway board before using it. During `countdown`, the
floating board is visible and shows the remaining server-aligned seconds, but
the local match remains immutable and telemetry forwarding is disabled.

The client estimates local trigger time using the server-time offset from the
authenticated `WELCOME`. At the shared start timestamp it changes the prepared
Match State Contract to `running`, resets prior challenge instances and
activates exactly one fresh instance for every drafted field. Challenges absent
from the board cannot generate Duel claims.

A later `running` snapshot is idempotent: it confirms the same match and does
not activate a second set of challenges. If the snapshot arrives before the
local timer, it starts the prepared match immediately using authoritative
`startedAt`.

## Deferred continuity work

v0.40.0 does not yet resume an active match after a disconnected Socket.IO
session. Disconnect still aborts the match. Lobby-change handling for series
challenges is also the next lifecycle hardening step before telemetry batches
and server-side claim resolution.
