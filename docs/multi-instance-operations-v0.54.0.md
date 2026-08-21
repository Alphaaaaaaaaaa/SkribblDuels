# Multi-instance Gateway operations — v0.54.0

> **v0.54.1 hotfix:** Deploy v0.54.1 or newer. v0.54.0 used an account-room
> disconnect during HELLO; Redis Streams could deliver it after the new socket
> joined and disconnect that socket. v0.54.1 uses an atomic Redis owner claim,
> exact connection-room takeover and Authority fencing epochs.

v0.54.0 makes the Gateway horizontally deployable on Railway without allowing
two processes to mutate the same live Duel.

## Runtime model

- Socket.IO uses the Redis Streams adapter. Account-room and connection-room
  messages therefore reach clients connected to any Gateway replica.
- A renewable 30-second Redis lease fences one replica as the live Match
  Authority. Only that leader restores Supabase snapshots, owns timers and
  processes Queue, Invite, Draft, telemetry, Claim and conclusion commands.
- Followers authenticate their own sockets and forward authenticated commands
  through the private Redis command channel. A command is successful only after
  the leader writes a short-lived acknowledgement; an election gap becomes a
  recoverable client error instead of a silent action loss.
- Every command renews and verifies the lease before it reaches the Matchmaker.
  A process that lost the lease closes its timers and cannot keep mutating.
- A new leader restores the durable Supabase aggregate, then disconnects cluster
  sockets once. The existing Contract v9 HELLO/resume flow reconnects both
  clients to the restored authoritative revision.

Railway does not currently provide sticky sessions. The production client uses
WebSocket-only Socket.IO transport, which keeps one persistent connection on
one replica and removes the polling/session-affinity requirement. Redis remains
mandatory for cross-replica packets and Authority coordination.

Platform references: [Railway scaling](https://docs.railway.com/deployments/scaling),
[Socket.IO multi-node routing](https://socket.io/docs/v4/using-multiple-nodes/)
and the [Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/).

## Required deployment order

1. Apply `supabase/migrations/202608210001_create_gateway_abuse_controls.sql`.
2. Add a private Redis service to the same Railway project and reference its
   `REDIS_URL` from the Gateway service. Do not expose Redis publicly.
3. Create a random `OBSERVABILITY_TOKEN` (at least 32 random bytes) as a Railway
   secret. It protects `/metrics` and `/diagnostics`.
4. Keep the existing `SUPABASE_SERVICE_ROLE_KEY`; it is not the database
   password and must remain Gateway-only.
5. Deploy one v0.54.0 replica. Verify public `/healthz`, then `/readyz`.
6. Verify `/metrics` and `/diagnostics` with
   `Authorization: Bearer <OBSERVABILITY_TOKEN>`.
7. Set `MATCHMAKING_SIMULATED_PLAYERS=false` for real-client tests and scale the
   Gateway service to two replicas.
8. Publish/reload the v0.54.0 userscript after the Gateway is ready.

`/healthz` is process liveness and deliberately does not query dependencies.
`/readyz` checks Supabase, Redis, the shared adapter and Match Authority and
returns HTTP 503 if any production dependency is unavailable.

The browser address bar cannot attach an Authorization header, so
`operations-auth-required` from a direct `/metrics` or `/diagnostics` visit is
the expected secure response. Verify from PowerShell without sharing the token:

```powershell
$token = 'YOUR_RAILWAY_OBSERVABILITY_TOKEN'
$base = 'https://YOUR-GATEWAY.up.railway.app'
Invoke-RestMethod "$base/diagnostics" -Headers @{ Authorization = "Bearer $token" }
(Invoke-WebRequest "$base/metrics" -Headers @{ Authorization = "Bearer $token" }).Content
```

## Metrics and alerts

The Prometheus endpoint exports connection totals, reconnect outcomes, active
sockets/Authority peers, queue wait, telemetry lag, rejected Claims, Match
aborts, transport errors and rate-limit decisions. Labels contain controlled
enums/reasons only—never account IDs, display names, tokens, chat or telemetry.

Import `ops/prometheus/skribbl-duels-alerts.yml` into the chosen Prometheus-
compatible monitor. The initial rules alert on readiness/realtime loss,
transport-error bursts and elevated Match aborts. Tune thresholds only after a
closed-beta baseline exists.

## Reconnect and incident policy

- A Redis or Authority election gap rejects new commands as recoverable; it
  never falls back to an independent in-process Matchmaker.
- An Authority change forces one socket reconnect so the normal durable resume
  path is the only state reconstruction path.
- A player still has the existing 30-second Duel reconnect grace. A running
  player who does not return loses by `player-disconnect`; pre-start phases are
  cancelled.
- `/diagnostics` is safe to attach to a support ticket after reviewing the
  instance/error strings. It contains aggregate counters and dependency state,
  not player content.
- Run `select * from public.purge_duel_operational_data();` daily from a trusted
  service-role job. It applies the documented 30/90-day operational retention.

## Abuse controls

Shared Redis fixed windows limit connection attempts and commands by hashed IP,
connection and account. Separate budgets exist for matchmaking, invites, chat,
match actions, telemetry and Claims. The Gateway also enforces operator-created
`full-ban`, `matchmaking-ban`, `chat-mute` and `telemetry-block` rows on the next
authenticated connection.

Rate violations, invalid messages, telemetry replay attempts and reconnect
timeouts create private `duel_abuse_signals`. Signals are evidence for manual
review; they do not automatically impose a long ban. This avoids turning a
temporary network failure into an irreversible sanction.
