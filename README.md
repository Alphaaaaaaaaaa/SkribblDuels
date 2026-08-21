# Skribbl Duels v0.54.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v9, Discord OAuth through Supabase Auth, authoritative Duel
profiles, private Gateway chat, resumable matchmaking and server-validated
challenge claims.

## v0.54.0

- Adds Railway-ready horizontal realtime delivery through the Socket.IO Redis
  Streams adapter. A renewable, verified Redis lease fences exactly one live
  Match Authority; followers forward authenticated commands and require a
  leader acknowledgement instead of running independent Matchmakers.
- Uses WebSocket-only production transport because Railway does not provide
  sticky sessions. Authority changes restore Supabase state and force the normal
  Contract v9 reconnect/resume path.
- Splits liveness (`/healthz`) from dependency readiness (`/readyz`) and adds
  bearer-protected Prometheus `/metrics` plus PII-safe `/diagnostics`, structured
  correlation logs and initial alert rules.
- Adds shared account/connection/IP rate limits, operator sanctions, private
  abuse signals and 30/90-day operational retention. Telemetry now rejects
  cross-batch event replay, invalid clocks and evidence outside the declared
  sequence cursor.
- Keeps Match Chat toast avatars at 32×32 despite Typo's `.avatar.fit` rule and
  adds the requested normal-button background on clickable-toast hover.

Apply `supabase/migrations/202608210001_create_gateway_abuse_controls.sql`, add
private Railway Redis as `REDIS_URL` and create `OBSERVABILITY_TOKEN` before
deploying the v0.54.0 Gateway. Verify `/readyz`, then publish the v0.54.0
userscript. Gateway Contract v9 is unchanged. See
`docs/multi-instance-operations-v0.54.0.md` for the exact rollout order.

## v0.53.0

- Converts an expired reconnect grace period during a running Duel into the
  explicit authoritative `player-disconnect` result. The connected opponent
  receives the Win screen immediately; the returning player restores the same
  terminal result instead of continuing a stale local Match.
- Retains a finished result for a disconnected participant when the winner
  already presses Return or starts another Match. Pre-start Ready/Draft/
  Countdown disconnects and simultaneous disconnects remain cancellations.
- Stops restored local Challenge tracking when the Gateway can no longer
  supply any authoritative Match snapshot, and hides transient Forfeit controls
  while a reloaded Match is still being reconciled.
- Adds the Skribbl Duels GIF as the Tampermonkey metadata icon, applies the
  shared panel accent palette to the homepage button and gives the Quick Access
  launcher independent anchor/custom-position and 36–120 px size settings.
- Styles Return in the danger palette, New Match in the Ranked palette and
  Rematch in the Casual palette.
- Match Chat toasts now show the sender's Duel avatar and display name. Clicking
  the toast opens and focuses the private Match Chat.

Deploy the v0.53.0 Gateway before publishing the v0.53.0 userscript because
both sides must use Gateway Contract v9. No Supabase migration is required.

## v0.52.1

- Refines the invite-ready card into a compact metadata row plus an equal-height
  link, icon-only Copy and Cancel control row. The read-only link selects in
  full on click/focus and the main Invite button now uses the requested 1.45em
  type size.
- Releases a finished Gateway Match immediately after Return and ignores late
  terminal snapshots, so the next invite is no longer rejected as an already
  active Match.
- Removes expired invites locally at their authoritative timestamp. Copy and
  Cancel therefore disappear without sending a stale cancellation request or
  leaving the user trapped outside normal Homepage matchmaking.
- Shows connected Gateway action errors only in the relevant matchmaking card
  instead of duplicating them below the connection status.

This is a userscript/client-only maintenance release. The v0.52.0 Gateway,
Contract v8 and existing invite migration remain compatible; no Railway
redeployment or database migration is required.

## v0.52.0

- Adds Gateway-owned Casual and Ranked invite links for closed two-client beta
  tests. Tokens are random, single-use and expire after 15 minutes; Supabase
  stores only their SHA-256 hashes.
- Atomically accepts or cancels invites with durable request IDs, rejects
  self-use/reuse, excludes QueueBots and starts the normal authoritative
  30-second Ready check for the two authenticated clients.
- Adds the compact Skribbl-style Invite button, format-selection/Auth toasts,
  automatic clipboard copy and URL bootstrap through
  `?scd-invite=<opaque-token>`.
- Fixes every Hub/Draft/result mouse action being destroyed by the capturing
  window-focus recovery handler. Ready Cancel now reopens the Duels Hub and
  the Versus avatars are smaller without shrinking their inner Special layer.
- Persists unacknowledged telemetry, in-flight batches and Claim candidates in
  session storage. `/credits` navigation and page/runtime reloads therefore
  replay Bloodline evidence before a Claim is validated instead of briefly
  showing `completion-pending` and then reverting it.

Apply `supabase/migrations/202608200001_create_duel_invites.sql` before
deploying the v0.52.0 Gateway, then publish the v0.52.0 userscript. Gateway and
userscript must both use Contract v8.

## v0.51.2

v0.51.2 fixes the live durable-authority outage caused by sending the internal
`accountId` property to a Supabase RPC that consumes `account_id`. Idempotency
rows are now translated explicitly at the database boundary, so telemetry ACKs
and server-validated Challenge claims are published again. No new migration is
required; redeploying the Gateway clears the fail-closed process state.

An unhealthy durable authority now makes `/healthz` return HTTP 503 with
`status: "degraded"`. The userscript reconnects automatically after a missing
Ready cancellation or an expired Ready deadline, caps the Versus panel at 75
viewport-percent, isolates the full Hub surface from Skribbl pointer handlers,
and batches routine telemetry for 150 ms while keeping Claim-triggered flushes
immediate.

## v0.51.1

v0.51.1 hardens the Versus ready-check controls against the QueueBot snapshot
race. Ready and Cancel now commit on the primary pointer press before a
server-driven re-render can replace the pressed DOM node, while keyboard clicks
remain supported without double submission. Both actions expose an immediate
busy label and recover from a missing server acknowledgement after four seconds
instead of leaving the UI permanently locked. Ready-check cancellation is sent
to the Gateway before local match state is reset.

## v0.51.0

- Moves live Match authority out of process-only maps into a private Supabase
  aggregate. Gateway restarts now restore phase, deadlines, Draft, board,
  participants, claims, result, private chat and per-player Challenge Engines.
- Persists action, chat, claim and telemetry idempotency keys with every
  authoritative revision. Duplicate client messages and candidates replay the
  original decision after a process restart instead of being applied twice.
- Re-arms ready, Draft, countdown, Draw and reconnect deadlines from their
  absolute timestamps after restoration; invalid/outdated definition snapshots
  are retired fail-closed.
- Prevents restored Claim/Win history from being injected into Skribbl chat a
  second time while reconstructing the missing result line in local Match Chat.
- Reconciles an expired countdown on tab focus/visibility recovery so the modal
  cannot strand the board after background timer throttling.
- Fixes Deserved? by requiring a positive first-place score (ties remain valid),
  preserves the last coherent positive scoreboard for Back to back, and adds a
  `performDrawCommand` fallback for fully played legacy bare-array `.skd` files.
- Restores the requested 48 px result visual, full-size inner Skribbl avatar,
  smaller winner composition and non-overlapping Match Chat input padding.

Challenge definitions are now v2.10.0. Apply
`supabase/migrations/202608190001_create_durable_match_authority.sql`, configure
the Gateway-only `SUPABASE_SERVICE_ROLE_KEY`, deploy the v0.51.0 Gateway, and
only then publish the v0.51.0 userscript. Gateway Contract v7 is unchanged.

## v0.50.0

- Fixes the Forfeit/Rematch telemetry deadlock by clearing queued envelopes,
  in-flight batches and pending candidates whenever a new match ID arrives.
- Prefers WebSocket transport, retains polling as a fallback and exposes
  Reconnect plus reconnect-and-forfeit controls inside an interrupted match.
- Locks New Match and Rematch until the visible Skribbl homepage is restored,
  so neither action can start while a Skribbl lobby is active.
- Requires first-guesser status for Blind Guess, Drunk Vision and Deaf Guess.
- Reads both current Typo `.skd` collections and legacy raw-command files,
  including detached file pickers without an `accept` attribute.
- Tightens Back to back: both wins need positive scores, the lobby must match,
  and the second game's start must have been observed. An unobserved second win
  becomes the first win of a fresh streak.
- Certifies Noob vs. Pro vs. Hacker and Bullet skribbl.io progress across lobby
  and language changes with dedicated regression coverage.
- Delays the final win line briefly so all accepted Challenge completions are
  inserted first, adds in-match recovery controls, and locks result actions
  correctly.
- Reduces Versus avatars and preserves the full Skribbl special layer without
  clipping. Finished-match text is centered in its right-hand result column.
- Applies the borderless panel card and accent/danger button styling requested
  for the Duel UI.

Challenge definitions are now v2.9.0. Deploy the v0.50.0 Gateway before the
userscript so both authoritative engines use the same definition versions.
No database or Gateway Contract migration is required.

## v0.49.1

- Restores the live telemetry handshake lost in v0.48.0. The Typo relay now
  starts synchronously before IndexedDB record redaction, so one-shot incoming
  and outgoing `MessagePort` transfers cannot be missed during startup.
- Runs stored-record redaction safely in the background and adds a regression
  check that protects the startup order.
- Restores the v0.48 square Challenge-icon sizing and scales the new result
  avatar, crown, trophy and winner animation to match it.
- Keeps Skribbl avatars transparent. The translucent avatar background is used
  only for initials fallbacks and Discord images where transparent pixels need
  a backdrop.
- Shows only the current Match Chat character count, reserves input space for
  it, removes WebKit scrollbar arrows and uses a full-width rounded thumb.
- Replaces the browser Forfeit confirmation with a Typo-compatible confirm
  toast.

No Gateway Contract, Challenge definition or database migration changes are
required for v0.49.1.

## v0.49.0

- Repairs Challenge continuity across page reloads. A running `/credits` match
  now preserves compatible Challenge runtimes, buffers new telemetry until the
  Gateway ACK cursor is restored and submits pending Bloodline claims afterward.
- Rebalances Ouch (200 ms), Picasso (4 likes), Cool Number Detected (500), Time
  Waste (50 s), Mogged (first guess only), Fanboy (every eligible drawing in one
  fully observed round), Color Picker (all 26 colors and every eligible guesser),
  and Hint Reflexes (nobody guessed before the first hint).
- Derives Need some space?, Smol words and Big word thresholds/required counts
  from the active official language list. Smol words and Big word require first
  guesser status.
- Replaces the finished-match diagnostics with the winner avatar, crown,
  trophy, human-readable elapsed time, final score and Return/New Match/Rematch
  controls.
- Adds Contract v7 server-authoritative Rematch readiness and a fresh ready
  check once both participants agree. Simulated opponents accept automatically.
- Adds the crowned winner animation and owner-colored Match Chat result line.
- Adds 300-code-point input counting, submit auto-scroll, a top fade for scrolled
  chat, Skribbl-style scrollbars and optional Typo-compatible chat toasts.

Gateway Contract is now v7. Existing profiles and match data need no new
database migration for v0.49.0.

## Install the userscript

Install `userscript/skribbl-duels-telemetry-inspector.user.js` in Tampermonkey.
The stable path is updated in place for each release; the metadata contains the
exact version.

If an older installation named `Skribbl Duels - Telemetry Inspector` is still
listed next to `Skribbl Duels`, remove or disable the older entry once. The
repository itself contains only the single stable Userscript entry point.

## Database migrations

v0.52.0 requires
`supabase/migrations/202608200001_create_duel_invites.sql`; installations that
have not deployed v0.51.0 must first apply
`supabase/migrations/202608190001_create_durable_match_authority.sql` before the
Gateway is deployed. v0.54.0 additionally requires
`supabase/migrations/202608210001_create_gateway_abuse_controls.sql`.
Installations upgrading from before v0.48.0 must also
apply `supabase/migrations/202608110001_add_invisible_avatar_entitlements.sql`.

## Local verification

```text
npm ci
npm run typecheck
npm test
npm run build
```

Node 24 is the documented development runtime. Never include Discord secrets,
Supabase database/service-role credentials, access tokens or refresh tokens in
the userscript or repository.

See `docs/invite-link-v0.52.0-plan.md`,
`docs/durable-match-authority-v0.51.0.md`,
`docs/reliability-challenge-hardening-v0.50.0.md`,
`docs/full-build-roadmap-post-v0.50.0.md`,
`docs/live-telemetry-ui-hotfix-v0.49.1.md`,
`docs/challenge-recovery-match-ui-v0.49.0.md`,
`docs/match-conclusions-ui-security-v0.48.0.md`,
`docs/gateway-chat-telemetry-authority-v0.47.0.md` and
`docs/ui-product-direction-v0.41.0.md`.
