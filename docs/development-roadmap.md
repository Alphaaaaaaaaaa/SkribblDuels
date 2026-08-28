# Skribbl Duels Development Roadmap

## Completed foundation

| Phase | Status | Result |
| --- | --- | --- |
| Telemetry and protocol state | Complete | Versioned telemetry contract, replay fixtures and protocol/lobby state |
| Challenge system | Complete | Growing pool, currently 47 modular Challenges with automated runtime coverage |
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
| GIF asset template | Complete | Validated mappings for all 47 Challenge IDs plus logo, settings, about and countdown frames |
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
| v0.55 Challenge live certification | Complete | Telemetry-triggered server Claims, per-challenge certification metrics, visible transport cursors and false-positive regressions |
| v0.56 Challenge/chat hardening | Complete | Telemetry-gated homepage matchmaking, strict Back to back/Deserved?, 28-language TL;DR v2 and Typo-compatible mirrored Match Chat |
| v0.57 UI/profile integration | Complete | Reload-safe lobby authority, Typo `leftLobby`, configurable Match Chat command/preview, optional SFX registry and authoritative 28-color names/Claims |
| v0.58 local player statistics | Foundation complete | Versioned input evidence, clean/Guess WPM correlation, per-language word history and coverage, IndexedDB persistence and local-only export API |

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

### 3. Challenge live certification — delivered in v0.55.0

- Accepted telemetry now triggers authoritative Claims without requiring a
  second browser command; the fallback candidate path remains idempotent.
- Bloodline, Autodraw, Typo active-turn boundaries, Deserved? and Sniper have
  dedicated live/false-positive regressions.
- Aggregate telemetry, Claim-source and rejection-reason metrics plus a visible
  client ACK/queue cursor make two-client certification measurable.
- Transcended expands the Casual pool in v0.55.1. TL;DR v2 ships in v0.56.0
  with deterministic offline dictionaries for all 28 languages; the other six
  proposed additions remain gated by the events recorded in
  `docs/challenge-live-certification-v0.55.0.md`.

### 4. Local statistics presentation and certification

- Build the Profile statistics UI on the v0.58 IndexedDB/API foundation,
  including language filters, occurrence ranking, coverage and data-quality
  indicators.
- Add rolling median/percentiles and session trends without rewriting the
  stable lifetime aggregates.
- Live-certify `TEXT_INPUT_MEASURED` against vanilla and Typo input, then define
  the server rule for WPM Challenges. Paste/autofill/untrusted samples stay
  ineligible; browser-only records never become public world records.

### 5. Ranked competition and history

- Define rating, provisional, season, Draw, Forfeit and reconnect-timeout rules.
- Apply each rating update exactly once and add leaderboard plus match history.
- Prevent repeated-opponent farming and certify every active Challenge in live
  two-client runs.

### 6. Product and release completion

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
follow after the v0.55 live Challenge certification gate.
The complete post-v0.50 build gate is recorded in
`docs/full-build-roadmap-post-v0.50.0.md`.
The complete approved UI direction is recorded in
`docs/ui-product-direction-v0.41.0.md`.
The current prioritized implementation sequence, confirmed Bingo MVP and all
remaining Challenge candidates are consolidated in
`docs/home-authority-ui-sfx-profile-colors-v0.57.0.md`.
The v0.58 local-stat schema, privacy boundary and expanded statistics backlog
are recorded in `docs/local-wpm-word-stats-v0.58.0.md`.
