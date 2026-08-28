# Skribbl Duels v0.56.0

This monorepo contains the growing 47-Challenge telemetry/challenge system, Product UI,
Gateway Contract v10, Discord OAuth through Supabase Auth, authoritative Duel
profiles, private Gateway chat, resumable matchmaking and server-validated
challenge claims.

## v0.56.0

- Locks matchmaking behind both a genuinely visible homepage and the latest
  Telemetry state, preventing an active lobby from being hidden with DevTools.
- Fixes Back to back for consecutive same-lobby wins and makes Deserved? require
  a sole positive first place from a coherent result without First Guesser.
- Replaces TL;DR's length-only rule with an offline 28-language prose detector,
  one-edit typo tolerance and random/repeated-text rejection.
- Keeps Match Chat focus/caret across incoming state, separates its scroll log
  from the form, mirrors confirmed messages into Skribbl chat and supports
  `/sdchat`, `/msg` and `/chat`, including Typo's command input.
- Removes the development redirect copy and the Discord `email` OAuth scope.
- Gives all 47 Challenges unique future-proof icon paths; Transcended reserves
  `challenge-icons/transcended.gif` and uses the normal fallback until supplied.

Deploy the v0.56.0 Gateway first, verify `/readyz`, then install or update the
v0.56.0 userscript. Gateway Contract v10 remains compatible; no Supabase
migration or new Railway variable is required.

## v0.55.1

- Resends durable telemetry immediately after an authenticated `WELCOME`, so a
  `/credits` navigation can no longer leave Bloodline and every later Claim
  blocked behind an unsent resume cursor.
- Detects the real Typo ImageLab `.skd` flow through the saved filename row,
  `performDrawCommand` playback and locked/unlocked completion state.
- Retries an initially unavailable homepage language with exponential timeouts
  and keeps a late Typo relay handshake open. All 28 canonical language IDs
  remain eligible to become authoritative when their lists can be fetched.
- Keeps the Duel Chat form visible when a Draw proposal expands a long Match
  panel, including a sticky input surface and nearest-scroll recovery.
- Changes the Challenge policy from a frozen pool to a growing pool and adds
  Transcended as Challenge 47 for Casual certification. It remains unavailable
  to Ranked drafts for now.
- Adds stable Tampermonkey `updateURL` and `downloadURL` metadata. Publishing a
  higher `@version` at the same raw GitHub path enables normal update checks.

Deploy the v0.55.1 Gateway first, verify `/readyz`, then install or update the
v0.55.1 userscript. Contract v10 and the existing Supabase/Redis setup remain
compatible; no migration or new Railway variable is required.

## One-click userscript installation

With Tampermonkey installed, open the tracked raw userscript URL and its native
installation page should appear:

<https://raw.githubusercontent.com/Alphaaaaaaaaaa/SkribblDuels/main/userscript/skribbl-duels-telemetry-inspector.user.js>

The published file contains `@updateURL` and `@downloadURL` pointing to that
same stable path. Keep the filename/path unchanged and increase `@version` for
every release; Tampermonkey then discovers and installs the newer source during
its configured update check. Do not point these metadata fields at versioned
ZIP files or GitHub blob pages.

## v0.55.0

- Makes accepted telemetry sufficient for a Claim: the Gateway's authoritative
  Challenge Engine now certifies each new completion immediately. The separate
  browser `CLAIM_CANDIDATE` remains an idempotent fallback instead of a required
  second command.
- Adds live Claim-pipeline state to the Match Hub and PII-safe per-challenge
  telemetry/candidate/resolution counters to `/metrics`, including rejection
  reason and certification source.
- Changes Bloodline v4 to complete on the captured homepage Credits click and
  flushes that event before `/credits` navigation can unload the userscript.
- Restores Autodraw detection for loaded `.skd` playback by observing nested
  `performDrawCommand` events on both document and window paths.
- Requires Blind, Drunk and Deaf Guess to be active before and throughout the
  drawing turn. Deserved? retains a coherent full scoreboard and First-Guesser
  disqualification across round resets; Sniper now requires First Guesser.
- Displays own Duel Chat messages optimistically while the authoritative spam
  score is evaluated, then replaces them by `clientMessageId` after Gateway
  confirmation. Only the Chat-toast message span owns ellipsis overflow.
- Invalidates outstanding Rematch requests when either terminal participant
  Returns, starts a New Match or disconnects.
- Attempts the canonical IDs for all 28 selectable Skribbl languages at Gateway
  startup. Every successfully fetched, non-empty word list becomes authoritative
  automatically; unavailable source files remain explicitly unsupported.
- Implements Transcended v1 with a coherent authoritative score roster and
  deterministic regressions as an inactive candidate at the time of v0.55.0.
- Defines deterministic certification gates for TL;DR v2 and the seven new
  Challenge candidates in `docs/challenge-live-certification-v0.55.0.md`.

Deploy the v0.55.0 Gateway first, verify `/readyz`, then reload the v0.55.0
userscript. Contract v10 is required on both sides. Existing Supabase and Redis
state remains compatible; no new migration or Railway variable is required.

## v0.54.2

- Replaces the eight-messages-per-ten-seconds Duel Chat window with Skribbl's
  score model: 100 ms minimum interval, score growth below 900 ms, four-point
  reduction after two idle seconds, tolerance three and kick boundary six.
  Browser and Match Authority use the same shared policy; a blocked submission
  stays in the input and appears as the leave-colored `Spam detected!` line.
- Persists the live Chat input across authoritative rerenders, so typing the
  next message immediately no longer gets erased when the previous message is
  confirmed by the Gateway.
- Bounds Match Chat notification toasts to the viewport and truncates long
  sender/message text with an ellipsis while retaining the full text as a
  native title.
- Shows an opponent's Rematch request with Duel avatar in Match Chat and as an
  optional clickable Chat toast. While waiting for the local response, the
  Rematch action moves from the result buttons into the request card.
- Corrects the per-instance active-socket gauge on disconnect and removes one
  byte-identical legacy fixture. Generated release archives are now excluded
  from source deployments.

Deploy the v0.54.2 Gateway before testing the authoritative Chat spam score,
then reload the v0.54.2 userscript. Contract v9 and the existing Supabase/Redis
configuration remain compatible; no migration is required.

## v0.54.1

- Fixes the production `io server disconnect` loop introduced by the Redis
  Streams rollout. Account reconnect takeover is now an atomic Redis claim and
  disconnects only the exact superseded connection instead of its account room.
- Adds a monotonically fenced connection epoch to internal Authority commands.
  Delayed Connect, Message or Disconnect commands from an older socket can no
  longer replace or remove the current authenticated session.
- Keeps `/metrics` and `/diagnostics` bearer-protected. Opening either URL in a
  browser address bar therefore still returns `operations-auth-required`; send
  the `Authorization: Bearer <OBSERVABILITY_TOKEN>` header to verify them.

Deploy the v0.54.1 Gateway over v0.54.0. Contract v9, the Supabase migration,
Redis and the existing userscript configuration remain compatible; no new
migration is required.

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
