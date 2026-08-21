# Privacy and security review — v0.54.0

## Trust boundaries

- The userscript is untrusted input. Discord/Supabase tokens are verified before
  any Gateway command, and client-supplied identity is never accepted.
- Supabase service-role access exists only in the Gateway process.
- Redis is trusted internal infrastructure. It must use Railway private
  networking and dedicated credentials; no browser receives `REDIS_URL`.
- The Match Authority is the only component allowed to advance a Duel.

## Stored data and retention

| Data | Location | Purpose | Retention |
| --- | --- | --- | --- |
| Discord profile projection/avatar choice | `profiles` | Duel identity | Until account update/deletion policy is invoked |
| Live/terminal Match aggregate, private chat and derived Challenge state | `duel_match_authority` | Resume, idempotency, dispute diagnosis | Live until expiry; terminal rows 30 days |
| Revision snapshots/derived evidence | `duel_match_authority_events` | Authority audit | 30 days |
| Invite token hash and lifecycle | `duel_invites` | Single-use friendly links | Terminal 30 days; stale waiting rows 7 days after expiry |
| Abuse signal with account/match/connection IDs | `duel_abuse_signals` | Manual abuse review | 90 days |
| Operator sanction | `duel_account_sanctions` | Enforce scoped restriction | Until expiry/revocation; retained for operator audit |
| Redis Streams packets/command acknowledgements | Private Redis | Cross-instance delivery | Bounded stream (20,000 packets); acknowledgements 5 seconds |

The Gateway does not persist raw telemetry batches as a separate event archive.
Only the derived Challenge Engine state and bounded recent event identifiers in
the Match aggregate survive for resume/validation.

## Exposure controls

- RLS is enabled and `anon`/`authenticated` access is revoked for Authority,
  Invite, abuse and sanction tables. Only `service_role` can use them.
- `/metrics` and `/diagnostics` require a timing-safe bearer-token comparison in
  production. The public `/healthz` and `/readyz` contain no user content.
- Structured logs include generated correlation IDs, command type and controlled
  error code, but no account ID, Discord ID, token, chat text or telemetry body.
- Prometheus labels use controlled state/reason strings only, preventing player
  identifiers from becoming high-cardinality monitoring data.
- Redis rate-limit subjects are SHA-256 hashes rather than raw IP/account IDs.

## Replay and injection controls

- Telemetry sequences remain contiguous and are matched to the active Match.
- Event IDs are rejected when repeated inside or across accepted batches and the
  bounded replay index survives Authority restart.
- Event and envelope clocks must fit the Match/receive window. Sequence remains
  authoritative even when independent DOM/packet adapters report slightly
  reordered timestamps.
- Claim evidence must match the server's completion candidate and every evidence
  event must be covered by the declared telemetry cursor.
- Match actions, chat, Claims and telemetry retain their existing durable
  idempotency keys.

## Sanction policy

Rate limiting is automatic and temporary. Invalid/replayed telemetry and
reconnect-timeout events are recorded as signals for operator review. Long-lived
restrictions require an explicit sanction row with a reason and expiry. This
separates noisy networks and accidental retries from deliberate automation,
Forfeit avoidance or telemetry injection.
