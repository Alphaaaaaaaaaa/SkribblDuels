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
| Lobby-series continuity | Complete | Back to back uses stable lobby identity; Noob vs. Pro vs. Hacker and Bullet retain global progress across lobby/language changes |
| GIF asset template | Complete | Validated paths for all 46 challenge icons plus logo, settings, about and countdown frames |
| Vanilla Hub and match-start stage | Complete | Homepage entry, intro, modal Hub, dynamic Duels/Match navigation and standalone Versus/Draft/Countdown views |
| Persistent Versus identity | Complete | Duel name, language, Discord/Skribbl avatar selection and server-controlled Special entitlement |
| Embedded visual assets | Complete | Real Challenge icons in intro, Draft and board plus animated GIF countdown |
| 3D introduction | Complete | Two non-coplanar, trackless icon orbits with perspective depth and logo crossing |
| UI interaction hardening | Complete | Inherited Skribbl font, contained profile fields and isolated pointer-capable controls |
| Gateway-backed Duel communication | Complete | Participant-only private chat with sanitization, rate limits, message-ID de-duplication and reconnect history |
| Telemetry and claim authority | Complete | Contract v5 batches, ACK cursors, independent server Challenge Engines, authoritative claims and win-target finish |
| Match conclusion controls | Complete | Contract v6 immediate Forfeit plus accepted/rejected/withdrawn/expired reconnect-safe Draw proposals |
| v0.48 UI and capture hardening | Complete | Bounded wrapped chat, isolated scrolling, native forms, stable icons, optional Win animation and login-code redaction |
| Invisible avatar entitlement | Complete | RLS grant table and profile RPC enforcement for historical negative avatar parts |
| Challenge recovery and rebalance | Complete | Reload-safe telemetry/Claim resume plus replay-backed updates for the twelve requested Challenges |
| Match result and Rematch UI | Complete | Crowned winner card/animation, human elapsed time, three result actions and Contract v7 Rematch readiness |
| Match Chat polish | Complete | Unicode counter, submit auto-scroll, top fade, native scrollbars and optional Typo-compatible toast notifications |
| v0.50 reliability hardening | Complete | Rematch queue isolation, WebSocket-first reconnect recovery, active-lobby action locks, `.skd` collection support and Challenge boundary tests |
| v0.51 durable Match authority | Complete | Supabase snapshots, restart hydration, re-armed deadlines, durable action/chat/claim/telemetry idempotency and revision audit history |
| v0.52 Friendly invite links | Complete | Hash-only single-use tokens, durable accept/cancel, Discord-auth bootstrap and direct real-client Ready checks |
| Reload-safe Challenge transport | Complete | Pending telemetry, in-flight batches and Claim candidates survive `/credits` navigation and runtime reloads until server ACK/resolution |
| v0.54 production infrastructure | Complete | Redis Streams delivery, fenced Match Authority, readiness/metrics/diagnostics, alert rules, shared limits, sanctions and replay hardening |

## Active development sequence

### 1. Friendly-match beta certification — completed

- The invite flow has been exercised successfully with two real authenticated
  clients; expiry, duplicate-use and cancellation UX have dedicated regressions.
- Decide whether a friendly match should receive a distinct format/history flag
  before Ranked history is introduced.

### 2. Production reliability — delivered in v0.54.0

- Redis Streams cross-replica delivery, WebSocket-only Railway routing and a
  fenced single Match Authority are implemented.
- Dependency readiness, protected metrics/diagnostics, correlation logs and
  Prometheus alert rules are implemented.
- Shared rate limits, operator sanctions, abuse audit/retention and telemetry
  replay/time/evidence enforcement are implemented.

### 3. Ranked competition and history

- Define rating, provisional, season, Draw, Forfeit and reconnect-timeout rules.
- Apply each rating update exactly once and add leaderboard plus match history.
- Prevent repeated-opponent farming and certify all 46 Challenges in live
  two-client runs.

### 4. Product and release completion

- Finish full German/English translation for Hub, queue facts, Draft, board,
  validation, errors and Challenge descriptions.
- Complete accessibility, responsive/reduced-motion QA and profile entitlement
  administration.
- Add two-browser end-to-end tests, transport/Gateway-restart tests, load tests,
  staging gates, canary release and rollback automation.
- Closed two-player tests, then Casual beta, then Ranked beta.

Challenge recovery, the balance pass and Rematch readiness shipped in v0.49.0.
v0.50.0 hardened the telemetry/reconnect boundary. v0.51.0 added restart-safe
Match authority and durable idempotency. v0.52.0 adds Contract v8 invite links
and reload-safe pending telemetry/Claims. v0.53.0 adds Contract v9 disconnect
conclusions plus late result restoration. v0.54.0 delivers multi-instance
coordination, observability and anti-abuse controls; Ranked competition/history
is now the highest-risk prerequisite.
The complete post-v0.50 build gate is recorded in
`docs/full-build-roadmap-post-v0.50.0.md`.
The complete approved UI direction is recorded in
`docs/ui-product-direction-v0.41.0.md`.
