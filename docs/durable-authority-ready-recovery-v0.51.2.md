# Durable authority and Ready recovery — v0.51.2

## Live diagnosis

The production Gateway exposed the exact failure in `/healthz`:

```text
null value in column "account_id" of relation "duel_match_idempotency"
violates not-null constraint
```

The in-memory durable snapshot deliberately uses the TypeScript property
`accountId`. The Supabase `persist_duel_match_authority` RPC consumes JSON rows
with the SQL property `account_id`. The initial ready, Draft, countdown and
running snapshots contained no idempotency row and could be committed. The
first telemetry cursor, chat message, action or Claim added such a row; SQL read
its account as `null`, rejected the transaction and put the process into its
fail-closed state. All associated telemetry ACKs, Claim resolutions and Match
snapshots then remained buffered rather than publishing uncommitted state.

## Fixes

- Serialize `accountId` to `account_id` explicitly at the Supabase RPC boundary.
- Keep the stored aggregate format unchanged, so already persisted snapshots
  remain restorable.
- Return HTTP 503 and `status: "degraded"` from `/healthz` when durable Match
  authority has failed.
- Reconnect automatically when a Ready cancellation is not acknowledged in
  four seconds or a Ready deadline remains visible one second after expiry.
- Stop Hub pointer events at the complete modal surface instead of only on
  individual form controls.
- Cap the Versus ready-check surface at `75vh`.
- Batch routine telemetry for 150 ms. Submitting a Claim candidate still forces
  the evidence batch to flush immediately.

## Deployment

No new Supabase migration is required.

1. Deploy the v0.51.2 Gateway first.
2. Verify `/healthz` returns HTTP 200, `status: "ok"`, and both Match Authority
   flags are `true`.
3. Reload/install the v0.51.2 userscript.
4. Run one Ready cancellation, one Ready timeout and one complete simulated
   Duel containing an accepted Challenge.

The previous process cannot recover from the poisoned fail-closed queue on its
own. A Gateway restart/redeploy is required once the serializer is fixed.
