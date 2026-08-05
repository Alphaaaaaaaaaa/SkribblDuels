# Skribbl Duels visual integration v0.46.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v4, Discord OAuth through Supabase Auth, authoritative Duel
profiles, resumable matchmaking and the server-authoritative draft lifecycle.

## v0.46.0

- Expands the two non-coplanar introduction orbits and renders thirteen real
  Challenge icons while retaining depth-based scale, opacity and logo crossing.
- Removes the dashed orbit tracks so the icon depth is the only orbital cue.
- Reduces the animated logo glow to the approved 7 px/14 px low-opacity pair.
- Uses 135-degree Skribbl-style `drop-shadow()` treatment for animated and
  product icons instead of box-shaped icon shadows.
- Inherits Skribbl's page font instead of forcing Arial.
- Keeps the Duel display-name input inside its field with an auto width,
  zero minimum width and flexible remaining-space sizing.
- Explicitly enables and isolates pointer, mouse, touch and wheel events on
  generated buttons, inputs, selects and textareas, including Duel chat.
- Adds an idempotent server-side Special grant for the supplied
  `analphabetism#0` profile without embedding a service credential.

Gateway Contract remains v4. Ready check, 15-second pair Draft turns, the
server-random parity field, synchronized ten-second start and 30-second
reconnect grace period are unchanged.

## Install the userscript

Install `userscript/skribbl-duels-telemetry-inspector.user.js` in Tampermonkey.
The stable path is updated in place for each release; the metadata contains the
exact version.

## Database migrations

Apply the files under `supabase/migrations/` in filename order. v0.46.0 does
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

See `docs/ui-polish-special-entitlement-v0.46.0.md`,
`docs/intro-avatar-countdown-v0.45.0.md`,
`docs/profile-versus-assets-v0.44.0.md`,
`docs/vanilla-hub-match-stage-v0.43.0.md` and
`docs/reconnect-draft-ui-icons-v0.42.0.md`.
