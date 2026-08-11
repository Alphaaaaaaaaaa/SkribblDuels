# Skribbl Duels v0.48.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v6, Discord OAuth through Supabase Auth, authoritative Duel
profiles, private Gateway chat, resumable matchmaking and server-validated
challenge claims.

## v0.48.0

- Adds unilateral, immediate, server-authoritative Forfeit.
- Adds one active Draw proposal with explicit opponent acceptance, rejection,
  proposer withdrawal, a 30-second timeout and reconnect restoration.
- Makes conclusion actions idempotent and keeps the first authoritative result
  immutable.
- Adds Match-chat result messages and a settings-controlled Win animation.
- Limits Duel chat to 300 Unicode code points, wraps long text and preserves
  manual scroll position while auto-scrolling readers already at the bottom.
- Isolates Hub/chat scrolling from the Skribbl page and adopts Skribbl's native
  form-control colors and focus states.
- Stops challenge-icon fallback flashes during telemetry ACK updates and keeps
  the Telemetry Inspector hidden by default.
- Removes private-lobby codes from live packet capture, legacy IndexedDB
  records and exports.
- Adds an owner-granted entitlement for historical negative avatar-part values.

Gateway Contract is now v6. Ready check, Draft, countdown, claims and the
46-challenge pool are otherwise unchanged.

## Install the userscript

Install `userscript/skribbl-duels-telemetry-inspector.user.js` in Tampermonkey.
The stable path is updated in place for each release; the metadata contains the
exact version.

## Database migrations

Apply the files under `supabase/migrations/` in filename order. v0.48.0 adds
`202608110001_add_invisible_avatar_entitlements.sql`; deploy it before the new
Gateway because authenticated profile loading now checks that RLS-protected
entitlement table.

To grant the invisible-parts Easter egg, copy
`supabase/admin/grant-invisible-avatar-template.sql`, replace its single zero
UUID with the new profile UUID and run it in the Supabase SQL editor. The old
profile UUID is deliberately not reused. Negative values below `-1` remain
server-rejected for every account without that grant.

The existing Special helper remains:

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

See `docs/match-conclusions-ui-security-v0.48.0.md`,
`docs/challenge-balance-backlog-post-v0.48.0.md`,
`docs/gateway-chat-telemetry-authority-v0.47.0.md`,
`docs/ui-polish-special-entitlement-v0.46.0.md`,
`docs/intro-avatar-countdown-v0.45.0.md`,
`docs/profile-versus-assets-v0.44.0.md`,
`docs/vanilla-hub-match-stage-v0.43.0.md` and
`docs/reconnect-draft-ui-icons-v0.42.0.md`.
