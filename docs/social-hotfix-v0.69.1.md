# Social reliability hotfix — v0.69.1

## Root cause

`gateway_respond_duel_friend_request` returned a column named `recipient_id`
and also used `recipient_id` unqualified in its row-lock query. In PL/pgSQL the
output name is a variable, so PostgreSQL could not decide whether that reference
meant the output variable or `duel_friend_requests.recipient_id`. Accept,
Decline, Ignore and Block all use this RPC and failed at execution time. Send
and Withdraw use direct table operations, which explains their different
behavior and why ordinary health checks remained green.

Migration `202610010001_fix_social_friend_response.sql` replaces the function
without changing its signature. Every request, friendship and pin column is
qualified by an explicit table alias, while the original row lock, atomic
friendship/block mutation and service-role-only execution boundary remain.

## Contract v16

- `gateway_social_contract_version()` returns `16` only after the hotfix is
  installed. Gateway v0.11.1 calls it from Social persistence health checks, so
  `/readyz` now fails with a precise contract error when the migration is absent.
- `FRIEND_UNBLOCK` removes only a block owned by the authenticated account.
  Search still reports the generic `blocked` relationship in either direction,
  but `canUnblock` is true only for the blocker. This avoids disclosing who
  blocked whom while still exposing the correct action.
- Search resolves relationship, preferences and directional unblock ownership
  concurrently after the exact username match.

## Diagnostics and client state

Unexpected Social failures are logged as `social-command-error` with a short
diagnostic ID, request ID, command type, error name/message, stack and cause.
The client-visible error contains the same diagnostic ID but no server secret
or account payload. Browser clients also log the code/message/request ID under
`[Skribbl Duels Social]`.

Social request errors use `socialError` instead of the global Gateway `error`.
They therefore produce a Social toast without replacing Homepage matchmaking
status. A successful Social snapshot or search result clears the channel.

## UI corrections

- Friend-search results independently trigger a modal render. The former UI
  compared only `social`, so a fast `FRIEND_SEARCH_RESULT` stayed invisible
  until closing and reopening the modal.
- While a search is pending, the avatar area uses Skribbl's rotating loader and
  the username/presence rows use skeleton bars.
- Availability updates the Profile badge optimistically and rolls back if the
  Gateway rejects the command.
- Friends is a full-width control below the Profile identity card. The Friends
  modal header no longer uses decorative Slimy icons, and only the Homepage
  friend list retains alternating row backgrounds.
- Icon buttons have transparent hover/active backgrounds. Selected green
  Social controls hover at `#38c41c`.

## Deployment

1. Apply `supabase/migrations/202610010001_fix_social_friend_response.sql`
   after `202609300001_add_social_graph.sql`.
2. Deploy Gateway v0.11.1 / Contract v16 and wait for `/readyz` to report
   `socialHealthy: true`.
3. Distribute the v0.69.1 userscript.

No new Railway variable is required. Contract v15 clients cannot connect to a
Contract v16 Gateway, so keep the Gateway-to-userscript interval short.

## Verification

`npm run test:v0691` covers the qualified migration, readiness probe, Social
error isolation, diagnostics, Unblock capability, immediate search rendering,
optimistic presence and Profile/Friends styling. The full release gate remains:

```text
npm ci
npm run typecheck
npm test
npm run build
```
