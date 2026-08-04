# Skribbl Duels Development Roadmap

## Completed foundation

| Phase | Status | Result |
| --- | --- | --- |
| Telemetry and protocol state | Complete | Versioned telemetry contract, replay fixtures and protocol/lobby state |
| Challenge system | Complete | 46 modular challenges with automated runtime coverage |
| Product foundation | Complete | Casual 3×3, Ranked 5×5, conflict-aware draft generation and match freeze |
| Account identity | Complete | Discord OAuth through Supabase, RLS profiles and automatic profile synchronization |
| Gateway foundation | Complete | Railway HTTPS service, token verification, profile lookup, `HELLO`/`WELCOME` and heartbeat |
| Release delivery | Complete | ASCII-safe installable userscript tracked at a stable GitHub path |
| Match lifecycle | Complete | New starts abort old local/server matches and dispose superseded userscript runtimes |
| Matchmaking and ready check | Complete | Homepage-only Gateway queues, simulated opponents and 30-second ready state |
| Server-authoritative pair draft | Complete | Two category-aware offers, equal player pick counts, timeout autopicks, server-random parity field and incremental boards |
| Synchronized match start | Complete | Fixed 10-second server countdown, shared start timestamp and activation of only the drafted board |

## Active development sequence

### 1. Vanilla homepage and Hub UI

- Inject the branded Skribbl Duels button below Play and Create.
- Add the logo/orbit introduction with reduced-motion handling.
- Replace the development panel with a Skribbl-style modal Hub.
- Show only Duels before a match; use top-right Settings and About icons.
- Preserve the new pair-draft and incremental board behavior in the Hub.

### 2. Account, localization and Versus identity

- Migrate profiles to Discord username plus custom Duel display name.
- Store preferred German/English language and localized challenge copy.
- Save Discord or normalized Skribbl avatar selection.
- Gate special avatar assets through server-controlled entitlements.
- Show both saved identities on a Versus screen and rotate localized queue facts.

### 3. Friendly matches and integrated communication

- Add expiring Gateway-owned Friendly invite creation and join tokens.
- Put private Duel chat inside the active Match view.
- Isolate Match chat focus from Skribbl Enter/hotkey handlers.
- Add completion SFX and independent settings toggles.
- Populate the challenge-ID icon asset registry.

### 4. Match continuity and telemetry authority

- Restore a live match after a short reconnect without trusting browser state.
- Reset series challenges when a player changes skribbl lobby.
- Batch normalized telemetry from each browser over Contract v2.
- Validate challenge claim candidates on the Gateway.
- Broadcast accepted and rejected claim resolutions with monotonic revisions.
- Keep skribbl.io and local telemetry running after a Duel finishes while
  suppressing further Duel claims and board changes.

### 5. Persistence and competition

- Persist matches, participants, boards, claims and final results in Supabase.
- Add Ranked rating updates and match history only after result validation is
  replay-tested.
- Implement two-complete-game series behavior such as Back to back without
  weakening lobby-change resets.

### 6. Product completion

- Reconnect/error UX, observability and abuse limits.
- Closed two-player tests, then Casual beta, then Ranked beta.

The immediate next milestone is the homepage button, introduction animation and
Vanilla-style Hub shell. Profile persistence follows immediately because its
language, display-name and avatar fields are required by queue facts and the
Versus screen. The complete approved UI direction is recorded in
`docs/ui-product-direction-v0.41.0.md`.
