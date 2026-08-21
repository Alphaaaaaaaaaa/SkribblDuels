# Environment configuration

## Browser userscript

The userscript contains working public defaults. Another deployment may override
them through `.env.local`:

```text
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_AUTH_REDIRECT_URL=https://skribbl.io/
VITE_GATEWAY_URL=https://YOUR-GATEWAY.up.railway.app
```

Every `VITE_` value is embedded into the userscript and is public. Never put a
Discord client secret, service-role key, database/Redis password, access token
or refresh token in a `VITE_` variable.

## Gateway server

Local development reads `apps/gateway/.env`; Railway values belong in the
Gateway service variables:

```text
NODE_ENV=production
PORT=8080
CLIENT_ORIGIN=https://skribbl.io
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
REDIS_URL=redis://default:...@redis.railway.internal:6379
OBSERVABILITY_TOKEN=<at-least-32-random-bytes>
MATCHMAKING_SIMULATED_PLAYERS=false
```

`SUPABASE_SERVICE_ROLE_KEY` is the service-role API key—not the Supabase
database password. It is required for private Match Authority, Invite, abuse
and sanction data. `REDIS_URL` must reference a private Redis service and is
required in production for the Redis Streams adapter, shared rate limits and
the fenced Match Authority. `OBSERVABILITY_TOKEN` protects `/metrics` and
`/diagnostics`.

Railway supplies `RAILWAY_REPLICA_ID`; local runs may optionally set
`GATEWAY_INSTANCE_ID`. Neither belongs in the browser build.

`MATCHMAKING_SIMULATED_PLAYERS=true` creates a server-owned QueueBot fixture.
Use it only for staging/single-client checks and set it to `false` for real
two-player beta tests.

The 30-second Ready deadline, 15-second draft choice, 3.2-second final reveal,
10-second countdown, 30-second player reconnect grace and 30-second Authority
lease are server constants.

The Discord client secret stays only in the Supabase Discord provider settings.
