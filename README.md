# Skribbl Duels v0.50.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v7, Discord OAuth through Supabase Auth, authoritative Duel
profiles, private Gateway chat, resumable matchmaking and server-validated
challenge claims.

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

v0.50.0 adds no migration. Installations upgrading from before v0.48.0 must
still apply `supabase/migrations/202608110001_add_invisible_avatar_entitlements.sql`
before deploying the current Gateway.

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

See `docs/reliability-challenge-hardening-v0.50.0.md`,
`docs/full-build-roadmap-post-v0.50.0.md`,
`docs/live-telemetry-ui-hotfix-v0.49.1.md`,
`docs/challenge-recovery-match-ui-v0.49.0.md`,
`docs/match-conclusions-ui-security-v0.48.0.md`,
`docs/gateway-chat-telemetry-authority-v0.47.0.md` and
`docs/ui-product-direction-v0.41.0.md`.
