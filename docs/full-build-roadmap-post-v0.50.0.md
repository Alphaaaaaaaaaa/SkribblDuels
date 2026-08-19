# Full-build roadmap after v0.50.0

This roadmap lists the work still required for a production-complete Skribbl
Duels build. Invite-link generation and implementation are assumed as a
separate, already identified workstream.

## P0 — production correctness

### Durable match authority

- **Delivered in v0.51.0:** persist Match participants, Draft, claims,
  conclusions, chat, per-player Challenge authority and Rematch readiness.
- **Delivered in v0.51.0:** restore live/finished matches and absolute timers
  after a Gateway restart.
- **Delivered in v0.51.0:** persist action/chat/claim/telemetry idempotency keys
  and an auditable revision log.
- Add retention rules for raw telemetry, derived evidence and chat.

### Realtime infrastructure

- Run Socket.IO across multiple Gateway instances with a shared adapter,
  sticky routing and a documented reconnect policy.
- Add health/readiness checks for Supabase, the realtime adapter and the match
  authority.
- Export structured metrics for connections, reconnects, queue time, telemetry
  lag, rejected claims, match aborts and transport errors.
- Add alerting, request correlation and a support-safe diagnostic export.

### Security and anti-cheat

- Rate-limit matchmaking, chat, draw actions, telemetry and claims per account
  and connection.
- Harden timestamp, sequence, replay and cross-match evidence validation.
- Define sanctions for disconnect abuse, deliberate Forfeit avoidance and
  automated telemetry injection.
- Complete a privacy/security review for Discord profile data, chat and stored
  match evidence.

## P1 — complete competitive product

### Ranked system

- Select and document the rating algorithm, provisional period and season
  reset model.
- Apply authoritative rating changes exactly once at match conclusion.
- Define Draw, Forfeit, reconnect-timeout and cancelled-match rating rules.
- Build rank display, leaderboard, match history and rating-change UI.
- Add queue compatibility rules and safeguards against repeated-opponent
  farming.

### Challenge certification

- Run every one of the 46 Challenges through live two-client fixtures, not only
  reducer replays.
- Cover joining mid-round, lobby/language changes, reloads, reconnects,
  Forfeit/Rematch and both Typo relay/fallback paths.
- Version Challenge behavior and balancing independently from the userscript;
  add a compatibility gate that rejects mismatched Gateway/client manifests
  before a draft starts.
- Finish balance telemetry: pick rate, completion rate, rejection reason and
  average completion time per Challenge.

### Match history and profiles

- Persist and display recent opponents, board, score, result, duration and
  accepted Challenge claims.
- Finish avatar/special entitlement administration and moderation controls.
- Define public/private profile fields and account deletion/export behavior.

## P2 — product quality and release readiness

### Localization and accessibility

- Complete German coverage for Gateway errors, matchmaking, draft, Match Chat,
  result and reconnect flows.
- Add keyboard navigation, focus restoration, ARIA labels and screen-reader
  status announcements.
- Verify reduced-motion behavior and responsive layouts on narrow/mobile
  screens.

### End-to-end and load testing

- Add automated two-browser tests from sign-in through matchmaking, draft,
  telemetry claim, conclusion and Rematch.
- Add forced WebSocket/polling failure tests and Gateway restart tests.
- Load-test queues, telemetry batches and simultaneous match conclusions.
- Maintain deterministic staging fixtures for all supported Skribbl languages.

### Deployment and operations

- Create staging and production environments with reviewed secrets, migrations
  and rollback procedures.
- Automate the required release order: database migrations, Gateway, health
  verification, then userscript.
- Add canary rollout, manifest/version monitoring and a one-command rollback.
- Finalize operator, moderation, incident-response and user installation docs.

## Recommended execution order

1. Multi-instance realtime infrastructure, observability and abuse controls.
2. Invite links on top of the durable authority.
3. Ranked rating, history and leaderboards.
4. Full Challenge live certification and balancing telemetry.
5. Localization, accessibility, end-to-end/load testing and release automation.

The product should be considered a complete production build only after P0 and
P1 are finished and the P2 release gates pass in staging.
