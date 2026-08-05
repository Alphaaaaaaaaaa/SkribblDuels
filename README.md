# Skribbl Duels Match-stage UI v0.43.0

This monorepo contains the 46-challenge telemetry/challenge system, Product Foundation UI, Gateway Contract v3, Discord OAuth through Supabase Auth, persistent account profiles, authenticated Socket.IO transport, homepage matchmaking, ready checks and the server-authoritative draft state machine.

## v0.43.0

- Adds the homepage Skribbl Duels button and one-time four-second logo/orbit introduction.
- Replaces the development side panel with a centered Skribbl-style modal Hub.
- Keeps the Hub closed initially and after match start until the user invokes the Duels icon.
- Shows only Duels before a match and only Match after the synchronized start.
- Moves Settings and About to icon actions in the Hub header.
- Opens a standalone central Versus/Ready screen immediately after matchmaking.
- Reserves `checkmark.gif` and `crossmark.gif` ready-state assets with text fallbacks.
- Moves the incremental board and two Draft options into a Hub-free central stage.
- Removes board-count, server-revision, pick-history and matchmaking copy from Draft.
- Replaces the completed-board score line with the live ten-second countdown.
- Integrates the Duel chat surface into the Match view and isolates Enter handling.
- Preserves Contract v3 reconnect, pair draft, parity field and lobby-series resets.

## Install the userscript

Open the current
[Skribbl Duels userscript](https://raw.githubusercontent.com/Alphaaaaaaaaaa/SkribblDuels/main/userscript/skribbl-duels-telemetry-inspector.user.js)
and install it in Tampermonkey. The stable path is updated in place for each
release; the userscript metadata contains the exact version.

## Gateway and matchmaking

- Adds an independently deployable Node/Socket.IO Gateway under `apps/gateway`.
- Verifies the Supabase access token during the Socket.IO connection handshake.
- Loads authoritative player identity from the RLS-protected `public.profiles` table.
- Implements Contract v3 authentication, queue, ready-check, pair draft, reconnect resume, parity reveal, countdown, running-match snapshot and heartbeat messages.
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

See `docs/vanilla-hub-match-stage-v0.43.0.md`, `docs/reconnect-draft-ui-icons-v0.42.0.md`, `docs/ui-product-direction-v0.41.0.md`, and `docs/environment-configuration.md`.

The current implementation sequence is documented in
[`docs/development-roadmap.md`](docs/development-roadmap.md). Release packaging
and encoding guarantees are documented in
[`docs/release-packaging-v0.37.2.md`](docs/release-packaging-v0.37.2.md).
