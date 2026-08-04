# Product Foundation v0.34.0

## Session-restored match state

The active product match is persisted in `sessionStorage` under `skribblDuelsProductMatchSessionV1`. The stored envelope contains the authoritative local Match State Contract snapshot and the exact generated Draft Board. A full same-tab navigation, including Bloodline's `/credits` navigation, restores the running or finished match instead of returning the product UI to `idle`.

An explicit match reset clears the session snapshot. A finished match also remains restored and frozen until explicitly reset.

## Stable UI rendering

The mount guard still checks whether the launcher, panel or board were removed, but it no longer rebuilds panel contents every 700 ms. It only renders after a real mount/remount. Settings updates apply board visibility and position without replacing the active Settings controls. Match updates only rerender the Duel or Match tab, not an open Chat or Settings tab.

## Challenge Board

The board is visible only if:

```text
settings.board.visible
AND match phase is not idle
AND the match contains fields
```

The board is always pointer-transparent and contains no drag handle, lock button or collapse button. All placement and display changes are made in the SD Settings tab through anchor selection or custom X/Y controls.

## Completion chat parity

Before inserting a completion paragraph, the adapter reads the current number of child elements in `.chat-content`. The next 1-based child index determines Base for odd children and Alt for even children, matching skribbl's own `p:nth-child(even)` behavior. Duel styles use stronger selectors plus `!important` for the foreground and background colors.

## Gateway Contract v1

The new `@skribbl-duels/gateway-contracts` package defines versioned client/server messages for:

- authenticated HELLO and resume data
- matchmaking join/leave
- ready checks
- draft picks
- claim candidates
- telemetry batches
- private Duel chat
- authoritative match snapshots/events
- claim resolutions
- heartbeat and errors

No production endpoint is connected in this release.
