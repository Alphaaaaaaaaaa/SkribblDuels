# Skribbl Duels Gateway Connected v0.37.1

This monorepo contains the 46-challenge telemetry/challenge system, Product Foundation UI, Gateway Contract v1, Discord OAuth through Supabase Auth, the persistent account profile schema, and the first authenticated Socket.IO Gateway handshake.

## v0.37.1

- Adds an independently deployable Node/Socket.IO Gateway under `apps/gateway`.
- Verifies the Supabase access token during the Socket.IO connection handshake.
- Loads authoritative player identity from the RLS-protected `public.profiles` table.
- Implements Contract v1 `HELLO`, `WELCOME`, `PING`, `PONG`, `AUTH_REQUIRED`, and `ERROR` messages.
- Provides `/healthz` for deployment health checks.
- Uses `https://skribblduels-production.up.railway.app` as the production userscript default.
- Keeps `VITE_GATEWAY_URL` available as a public build-time override.
- Keeps matchmaking, ready checks, drafting, claims, ratings, results, and Duel chat inactive until the live authenticated handshake is verified.
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

See `docs/gateway-deployment-v0.37.1.md`, `docs/gateway-auth-handshake-v0.37.0.md`, `docs/profile-foundation-v0.36.0.md`, `docs/auth-foundation-v0.35.0.md`, and `docs/environment-configuration.md`.
