# Disconnect authority and launcher settings — v0.53.0

## Authoritative disconnect result

Gateway Contract v9 adds `player-disconnect` to `GatewayMatchConclusion.reason`.
The Gateway applies it only after all of these conditions are true:

- the Match reached `running`;
- one real participant stayed disconnected for the configured reconnect grace
  period;
- the opponent is still connected or is an authoritative simulated player.

The connected opponent becomes the winner, the disconnected account becomes
the loser and `initiatedByAccountId` is `null` because the timeout is a
server-owned transition. If both real participants are disconnected, or the
Match has not started, the Gateway cancels instead of inventing a winner.

The conclusion is persisted before it is delivered. A participant who leaves
the result view is detached from that finished Match without deleting the
other participant's result receipt. The detached-account set is part of the
durable aggregate, so a Gateway restart cannot reattach a player who already
returned to matchmaking. Once the remaining participant also leaves, the
finished aggregate is finalized normally.

On reconnect, the userscript restores the terminal snapshot, freezes Challenge
telemetry, writes the disconnect result to Match Chat and presents the normal
Win UI. If no authoritative snapshot exists anymore, it stops the stale local
Match and shows an explicit notification instead of leaving Claim candidates
in `completion-pending`.

## UI settings v4

The Quick Access launcher now has its own settings object:

- `mode`: screen anchor or custom coordinates;
- `anchor`: the same eight viewport anchors as the Challenge Board;
- `x` / `y`: clamped custom viewport coordinates;
- `size`: 36–120 pixels.

Existing UI settings migrate automatically to the prior 60 px, center-right
launcher default. No database migration is involved.

## Deployment

Deploy the v0.53.0 Gateway first and verify `/healthz` reports Contract v9.
Publish the v0.53.0 userscript only afterward. Contract v8 clients and servers
are intentionally rejected rather than interpreting disconnect conclusions
inconsistently.
