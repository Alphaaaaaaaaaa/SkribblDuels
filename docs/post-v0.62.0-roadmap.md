# Prioritized roadmap after v0.62.0

This is the recommended restart point after the August/September 2026 break.
Items are ordered by product risk and dependency, not by implementation size.

## P0 — authoritative Claim reconnect recovery

Target: reproduce and eliminate the beta regression where a Challenge completes
locally but never becomes an accepted authoritative Gateway Claim.

1. Capture one affected Match with client/Gateway version, Match revision,
   local completion candidate, evidence event IDs, forwarded sequence, latest
   ACK cursor, queued/in-flight counts, reconnect history and final Claim
   resolution or timeout.
2. Add an active-Match watchdog for stalled ACKs and unresolved local Claim
   candidates. Recovery must reconnect with the exact Match ID, wait for the
   Gateway cursor and authoritative snapshot, replay only unacknowledged
   telemetry, reconcile board Claims and then flush pending candidates.
3. Preserve the existing idempotency boundary: duplicate telemetry, candidate
   submission and reconnect attempts may never award a field twice. A local
   completion remains pending until the server broadcasts acceptance.
4. Add forced-failure two-client tests at each boundary: before telemetry send,
   batch in flight, after Gateway ACK, before Claim resolution, after resolution
   but before client receipt, userscript reload and Gateway restart.
5. Expose a compact recovery state in the Match UI and support diagnostics so a
   tester can distinguish disconnected transport, stalled ACK, queued candidate,
   rejected evidence and restored authoritative Claim.

Exit criterion: every injected transport interruption either converges on the
same server Claim for both clients or yields one explicit rejection; no local
Claim can remain unresolved indefinitely.

## P0.1 — v0.62 release closure and two-client UI certification

Target: close v0.62.0 with observable evidence before starting another feature.

1. Synchronize the final artwork from GitHub and regenerate both icon modules.
   Confirm every registry path is embedded or explicitly accepted as a
   fallback; record the final missing-path list in the release evidence.
2. Deploy Gateway first, verify `/healthz`, `/readyz`, Redis/Supabase readiness
   and the loaded Challenge Definitions version, then distribute the userscript.
3. Run a real two-client queue and Invite matrix covering:
   - nested Profile/status/color modals closing when a player is found;
   - continuous private-chat typing while telemetry and Match snapshots arrive;
   - profile color/name changes during an existing Match;
   - observed and joined-mid-round Guess Time behavior;
   - Profile coverage/sort changes at a non-zero scroll position.
4. Preserve screenshots, logs, client/Gateway versions and exact release hashes
   as the v0.62 certification record.

Exit criterion: both flows pass twice without leaked chat input, stale profile
color, reopened modal animation, scroll jump or unobserved Guess Time.

## P1 — finish Challenge live certification

Target: make Ranked eligibility an evidence decision for the remaining five
Casual-only entries: GuessingOAT, Drop Streak, Internet Explorer, WPMaster and
TypeRacer.

1. Add a reusable two-client certification harness that records telemetry,
   Gateway acceptance/rejection, claim source and replay result in one fixture.
2. Test success plus false-positive cases: mid-round join, lobby/language
   change, paste/autofill/synthetic input, reconnect/reload, duplicate evidence,
   stale measurement, same-message mismatch and automatic game restart.
3. Promote one definition per version only after live and replay outcomes agree.
4. Add a Gateway/client Challenge-manifest compatibility gate before Ranked
   draft creation so mismatched rule versions cannot enter a board.

Exit criterion: all 53 definitions have a documented live status; every Ranked
entry has a replayable two-client certificate and version match.

## P2 — authoritative Ranked progression

Target: turn Ranked from a format selector into a durable competitive system.

1. Decide and document rating algorithm, provisional games, season reset and
   placement behavior with worked examples.
2. Specify Draw, Forfeit, disconnect timeout, cancellation, Rematch and repeated
   opponent rules before changing persistence.
3. Apply rating mutations exactly once at authoritative Match conclusion and
   audit every change against the durable Match revision/idempotency key.
4. Add private match history first, then rank display and leaderboard. Include
   board, score, duration, accepted Claims, rating delta and conclusion reason.
5. Add repeated-opponent farming limits and privacy/account deletion/export
   behavior before public launch.

Exit criterion: restart/reconnect simulations cannot duplicate or lose a rating
change, and every displayed result can be traced to one durable conclusion.

## P3 — product quality and beta gates

Target: make closed Casual and Ranked beta supportable without manual recovery.

1. Complete German/English coverage for Gateway, queue, Draft, Match Chat,
   result, reconnect and Profile errors.
2. Finish keyboard/focus, screen-reader announcements, narrow/mobile layouts,
   reduced-motion and color-contrast QA.
3. Add automated two-browser journeys for queue and Invite through Draft,
   Claims, conclusion, reconnect and Rematch; then add Gateway restart and load
   scenarios.
4. Establish staging, canary, version monitoring and one-command rollback with
   an operator runbook and support-safe diagnostics.
5. Use beta telemetry to compact Challenge tooltips and fix only demonstrated
   rule regressions; keep unrelated definitions stable during certification.

Exit criterion: staging passes the release matrix, rollback is rehearsed, and
closed beta can be diagnosed without exposing chat, tokens or raw telemetry.

## P4 — Advancements, Mini-Games, currency and Pets ecosystem

Target: define the long-term progression layer without weakening Duel fairness
or coupling it directly to skribbl.io implementation details.

1. Specify `Advancements` as a separate, versioned progression system. Decide
   which are local, account-wide or server-certified and which Telemetry Event
   evidence they may consume; do not reuse competitive Challenge Claims as an
   implicit achievement ledger.
2. Design a modular Mini-Game lifecycle and catalog before individual games:
   discovery/start, eligibility, command budget, result evidence, reward,
   cooldown and abuse limits. Mini-Games that draw must use the shared semantic
   canvas/native draw-action boundary rather than printer-event heuristics.
3. Define an authoritative in-game-currency ledger with explicit earn sources,
   sinks, transaction idempotency, anti-farming limits and rollback/audit rules.
   Competitive outcomes must not become pay-to-win.
4. Define Pets as cosmetic/progression content connected to explicit
   Advancement or currency rules: ownership, selection, animation/state,
   visibility, persistence and future content versioning all remain modular.
5. Treat Gradient Tool and Transparent Canvas as a shared adjacent canvas-tool
   platform. Transparency must survive Zoom, Image Post, Typo Cloud, Save Image
   and Image Laboratory paths. Challenge observation, Drop catchability,
   thumbs-up/down and awards remain behaviorally unchanged.
6. Resolve the open product choices in a dedicated design version before schema
   work: currency name and earn rate, reward boundaries, Pet acquisition and
   progression, public/private Advancement visibility, and which Mini-Games
   belong inside Skribbl Duels versus the wider Skribbl tool ecosystem.

Exit criterion: approved contracts and UX flows define ownership, authority,
privacy and anti-cheat boundaries before any irreversible database migration.

## First session after the break

Start by reproducing the local-only Claim regression and implementing the P0
recovery matrix. Then finish the v0.62 artwork/UI audit. If both are clean, build
the P1 certification harness before promoting another Challenge or starting
rating UI; that harness is the highest-leverage dependency for Ranked safety
and the later automated browser suite. Run the P4 ecosystem as a parallel
design track only; do not let it delay correctness work or trigger schema
changes before its open product choices are approved.
