# Environment configuration

## Browser userscript

The userscript needs only public configuration. It already contains working defaults, so a local `.env` is optional for the current Supabase project.

To override those defaults for another Supabase project, copy `.env.example` to `.env.local` and set:

```text
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_AUTH_REDIRECT_URL=https://skribbl.io/
VITE_GATEWAY_URL=https://skribblduels-production.up.railway.app
```

Every `VITE_` value is embedded into the built userscript and must be treated as public. Never put a Discord client secret, Supabase secret/service-role key, database password, access token, or refresh token in a `VITE_` variable.

The production Gateway URL is already the browser-build default. `VITE_GATEWAY_URL` is optional and only needed to override it for another public HTTPS deployment.

## Gateway server

The Gateway owns a separate runtime environment. Copy `apps/gateway/.env.example` to `apps/gateway/.env` for local development, or enter the same variables in the deployment dashboard. The local file is ignored by Git.

Gateway v0.41.0 needs:

```text
NODE_ENV=development
PORT=3000
CLIENT_ORIGIN=https://skribbl.io
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
MATCHMAKING_SIMULATED_PLAYERS=true
```

`MATCHMAKING_SIMULATED_PLAYERS=true` creates a server-owned test opponent after
a short queue delay. Remove it or set it to `false` before real two-player beta
testing. Real authenticated players are always paired before a simulated player.
The 30-second ready deadline, 15-second pair-draft deadline, 3.2-second final
parity reveal and 10-second pre-match countdown are authoritative server
constants; no additional Railway variable is required for v0.41.0.

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are the same public values used by the browser build. No Supabase secret/service-role key or database URL is required: token verification uses Supabase Auth and the profile query runs with the authenticated user's bearer token under RLS.

Add `SUPABASE_SECRET_KEY` only when a later Gateway milestone performs privileged writes. Add `SUPABASE_DB_URL` only if it later connects directly to Postgres. Unused secrets should not be collected in advance.

The Discord client secret remains in the Supabase Discord provider settings. It does not belong in either userscript or Gateway environment files.
