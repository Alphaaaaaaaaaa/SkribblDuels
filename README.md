# Skribbl Duels Pair Draft v0.41.0

This monorepo contains the 46-challenge telemetry/challenge system, Product Foundation UI, Gateway Contract v2, Discord OAuth through Supabase Auth, persistent account profiles, authenticated Socket.IO transport, homepage matchmaking, ready checks and the server-authoritative draft state machine.

## v0.41.0

- Offers exactly two compatible, category-aware challenges per 15-second turn.
- Gives both players equal influence: 4+4 choices in Casual and 12+12 in Ranked.
- Chooses the ninth or twenty-fifth field randomly on the Gateway.
- Publishes a 3.2-second finalizing phase for the slot-style client reveal.
- Shows an initially empty board and fills one square field after every accepted pick.
- Changes ready acceptance to a one-click, one-way action with immediate pending state.
- Uses square borderless panel-colored fields, removes field numbers and wraps tooltips at 50 characters.
- Preserves the authoritative 10-second countdown and synchronized match start from v0.40.0.

## Install the userscript

Open the current
[Skribbl Duels userscript](https://raw.githubusercontent.com/Alphaaaaaaaaaa/SkribblDuels/main/userscript/skribbl-duels-telemetry-inspector.user.js)
and install it in Tampermonkey. The stable path is updated in place for each
release; the userscript metadata contains the exact version.

## Gateway and matchmaking

- Adds an independently deployable Node/Socket.IO Gateway under `apps/gateway`.
- Verifies the Supabase access token during the Socket.IO connection handshake.
- Loads authoritative player identity from the RLS-protected `public.profiles` table.
- Implements Contract v2 authentication, queue, ready-check, pair draft, parity reveal, countdown, running-match snapshot and heartbeat messages.
- Provides `/healthz` for deployment health checks.
- Uses `https://skribblduels-production.up.railway.app` as the production userscript default.
- Keeps `VITE_GATEWAY_URL` available as a public build-time override.
- Records the live authenticated Railway `WELCOME` handshake as verified.
- Keeps queue membership, opponent identity, supersession, ready deadlines, draft turns, picks, final boards and match start time authoritative on the Gateway.
- Requires `MATCHMAKING_SIMULATED_PLAYERS=true` only while simulated queue opponents are desired.
- Preserves the v0.36.0 profile migration and its read-only client security boundary.
- Preserves all Product Foundation, match-freeze, UI-stability, drafting, and 46-challenge behavior.

## Local verification

```text
npm ci
npm run typecheck
npm test
npm run build
```

Node 24 is the documented development runtime.

## Apply the database migration

Open **Supabase Dashboard → SQL Editor → New query**, paste the complete contents of:

```text
supabase/migrations/202608040001_create_skribbl_duels_profiles.sql
```

Run it once. Then run:

```text
supabase/verify_profiles.sql
```

The verification must report RLS enabled, authenticated read access, no anonymous access, no authenticated write access, and one profile for every existing Auth user.

## Security

Never include the Discord client secret, Supabase database password, Supabase secret/service-role key, or refresh credentials in the userscript. Rotate any secret that has been shared or committed.

See `docs/pair-draft-and-parity-final-v0.41.0.md`, `docs/ui-product-direction-v0.41.0.md`, `docs/synchronized-match-start-v0.40.0.md`, `docs/server-authoritative-draft-v0.39.0.md`, `docs/matchmaking-ready-check-v0.38.0.md`, and `docs/environment-configuration.md`.

The current implementation sequence is documented in
[`docs/development-roadmap.md`](docs/development-roadmap.md). Release packaging
and encoding guarantees are documented in
[`docs/release-packaging-v0.37.2.md`](docs/release-packaging-v0.37.2.md).
