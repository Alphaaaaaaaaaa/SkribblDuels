# Skribbl Duels v0.47.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v5, Discord OAuth through Supabase Auth, authoritative Duel
profiles, private Gateway chat, resumable matchmaking and server-validated
challenge claims.

## v0.47.0

- Routes private Duel chat through authenticated Gateway membership and only to
  the two matched participants.
- Sanitizes and rate-limits chat, de-duplicates client message IDs and replays a
  bounded in-memory history on reconnect.
- Batches normalized telemetry with contiguous per-player sequences and ACK
  cursors.
- Runs an independent Challenge Engine per real participant on the Gateway and
  validates definition versions plus exact evidence event IDs.
- Keeps browser completions pending until the Gateway accepts or rejects them.
- Broadcasts authoritative claims with owner, timestamp and monotonic match
  revision; reconnect snapshots retain the exact claim state.
- Ends and freezes the Duel authoritatively when the format win target is
  reached while Skribbl telemetry itself continues locally.
- Preloads every supported official word list before the production Gateway
  starts so word-list challenges use the same authority path.

Gateway Contract is now v5. Ready check, 15-second pair Draft turns, the
server-random parity field, synchronized ten-second start and 30-second
reconnect grace period are unchanged.

## Install the userscript

Install `userscript/skribbl-duels-telemetry-inspector.user.js` in Tampermonkey.
The stable path is updated in place for each release; the metadata contains the
exact version.

## Database migrations

Apply the files under `supabase/migrations/` in filename order. v0.47.0 does
not add a schema migration. To enable the requested Special for the supplied
profile, run this owner-only helper once in the Supabase SQL editor:

```text
supabase/admin/grant-analphabetism-special.sql
```

It requires the v0.44.0 profile expansion and v0.45.0 ASCII-name migration.
After running it, reload skribbl.io, choose `Current Skribbl avatar` and save
the profile. The visible Special remains the fourth value of the current
Skribbl avatar; the SQL grants permission but does not choose another sprite.

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

See `docs/gateway-chat-telemetry-authority-v0.47.0.md`,
`docs/ui-polish-special-entitlement-v0.46.0.md`,
`docs/intro-avatar-countdown-v0.45.0.md`,
`docs/profile-versus-assets-v0.44.0.md`,
`docs/vanilla-hub-match-stage-v0.43.0.md` and
`docs/reconnect-draft-ui-icons-v0.42.0.md`.
