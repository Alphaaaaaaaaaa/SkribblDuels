# Skribbl Duels v0.49.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v7, Discord OAuth through Supabase Auth, authoritative Duel
profiles, private Gateway chat, resumable matchmaking and server-validated
challenge claims.

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

## Database migrations

v0.49.0 adds no migration. Installations upgrading from before v0.48.0 must
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

See `docs/challenge-recovery-match-ui-v0.49.0.md`,
`docs/match-conclusions-ui-security-v0.48.0.md`,
`docs/gateway-chat-telemetry-authority-v0.47.0.md` and
`docs/ui-product-direction-v0.41.0.md`.
