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
| Match reconnect continuity | Complete | Contract v3 resume cursor, 30-second server grace, authoritative snapshot restoration and stale-state rejection |
| Draft interaction hardening | Complete | Stable clock updates, centered two-choice surface, Left/Right Arrow input and definition tooltips |
| Lobby-series reset | Complete | Back to back and OMG Hacker reset from canonical lobby-session changes |
| GIF asset template | Complete | Validated paths for all 46 challenge icons plus logo, settings, about and countdown frames |
| Vanilla Hub and match-start stage | Complete | Homepage entry, intro, modal Hub, dynamic Duels/Match navigation and standalone Versus/Draft/Countdown views |

## Active development sequence

### 1. Account, localization and persistent Versus identity

- Migrate profiles to Discord username plus custom Duel display name.
- Store preferred German/English language and localized challenge copy.
- Save Discord or normalized Skribbl avatar selection.
- Gate special avatar assets through server-controlled entitlements.
- Replace the current Discord/fallback Versus portraits with both saved identities and rotate localized queue facts.

### 2. Friendly matches and integrated communication

- Add expiring Gateway-owned Friendly invite creation and join tokens.
- Connect the existing Match-integrated Duel chat surface to authoritative Gateway messages.
- Add completion SFX and independent settings toggles.
- Populate the challenge-ID icon asset registry.

### 3. Telemetry authority

- Batch normalized telemetry from each browser over Contract v3.
- Validate challenge claim candidates on the Gateway.
- Broadcast accepted and rejected claim resolutions with monotonic revisions.
- Keep skribbl.io and local telemetry running after a Duel finishes while
  suppressing further Duel claims and board changes.

### 4. Persistence and competition

- Persist matches, participants, boards, claims and final results in Supabase.
- Add Ranked rating updates and match history only after result validation is
  replay-tested.
- Implement two-complete-game series behavior such as Back to back without
  weakening lobby-change resets.

### 5. Product completion

- Reconnect/error UX, observability and abuse limits.
- Closed two-player tests, then Casual beta, then Ranked beta.

The immediate next milestone is the profile migration because its language,
custom display-name, avatar-source and entitlement fields are required by
localized queue facts and persistent Versus identities. The complete approved UI direction is recorded in
`docs/ui-product-direction-v0.41.0.md`.
