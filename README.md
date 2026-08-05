# Skribbl Duels visual integration v0.45.0

This monorepo contains the 46-challenge telemetry/challenge system, Product UI,
Gateway Contract v4, Discord OAuth through Supabase Auth, authoritative Duel
profiles, resumable matchmaking and the server-authoritative draft lifecycle.

## v0.45.0

- Replaces the flat introduction with two non-coplanar 3D orbit planes.
- Projects nine real Challenge icons with depth-based position, scale, opacity
  and z-index around the embedded Skribbl Duels logo GIF.
- Uses the supplied GIF/PNG assets in Draft, parity reveal and the live board.
- Keeps Draft choices neutral; self/opponent colors start only after a field is
  claimed during the Duel.
- Animates `5`, `4`, `3`, `2`, `1`, `G`, `O`, `!` from above the viewport,
  through the center and quickly below it.
- Renders normalized Skribbl avatars from the official color, eyes, mouth and
  special sprite atlases with ten sprites per row.
- Restricts Duel display names to 3–24 ASCII alphanumeric characters and shows
  localized inline validation beneath the input.
- Uses Duel display names in match/chat UI while preserving QueueBot names.
- Keeps Duel chat focused after Enter, blurs it with Escape and inserts an
  owner-colored winner message with exact `hh:mm:ss` duration.
- Styles the fixed launcher as a background-free 60×60 GIF with the requested
  drop shadow and removes the homepage button tooltip.

Gateway Contract remains v4. Ready check, 15-second pair Draft turns, the
server-random parity field, synchronized ten-second start and 30-second
reconnect grace period are unchanged.

## Install the userscript

Install `userscript/skribbl-duels-telemetry-inspector.user.js` in Tampermonkey.
The stable path is updated in place for each release; the metadata contains the
exact version.

## Database migrations

Apply the files under `supabase/migrations/` in filename order. v0.45.0 adds:

```text
supabase/migrations/202608050002_enforce_ascii_duel_names.sql
```

It can be run after the v0.44.0 profile expansion and safely normalizes an
older non-ASCII Duel name to a deterministic account-specific fallback before
installing the stricter constraint.

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

See `docs/intro-avatar-countdown-v0.45.0.md`,
`docs/profile-versus-assets-v0.44.0.md`,
`docs/vanilla-hub-match-stage-v0.43.0.md` and
`docs/reconnect-draft-ui-icons-v0.42.0.md`.
