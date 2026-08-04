# Authenticated Gateway Handshake v0.37.0

## Scope

This release proves one complete authoritative path and deliberately stops before matchmaking:

```text
Supabase session
→ Socket.IO handshake auth
→ verified access-token claims
→ RLS-scoped public.profiles lookup
→ token-free HELLO
→ WELCOME
```

## Security boundary

- The browser sends its short-lived Supabase access token only in `socket.handshake.auth.accessToken`.
- Socket.IO middleware verifies the token before the connection handler runs.
- The Contract v1 `HELLO` contains no token and is validated before use.
- The Gateway loads `accountId`, Discord ID and display name from `public.profiles`; it never trusts identity fields supplied by the userscript.
- The profile query carries the user's bearer token, so the existing RLS policy remains active.
- Access-token expiry closes the authenticated connection. A refreshed browser session reconnects with the new token.
- Tokens, emails and secret keys are never written to logs or included in `WELCOME`.

## Implemented messages

| Direction | Message | Result |
| --- | --- | --- |
| Client → server | `HELLO` | Establishes Contract v1, client version and capabilities |
| Server → client | `WELCOME` | Returns authoritative profile identity and connection ID |
| Client → server | `PING` | Optional application-level clock probe |
| Server → client | `PONG` | Returns current server time |
| Server → client | `AUTH_REQUIRED` | Missing, invalid or expired Supabase token |
| Server → client | `ERROR` | Invalid contract or reserved message not implemented yet |

Matchmaking, ready state, drafting, telemetry batches, claims and Duel chat remain reserved but inactive.

## Deployment handoff

The source is deployable as a shared npm monorepo service.

- Build command: `npm ci && npm run build:gateway`
- Start command: `npm run start:gateway`
- Health path: `/healthz`
- Required runtime variables: `NODE_ENV`, `PORT`, `CLIENT_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`

After a public HTTPS domain exists, set `VITE_GATEWAY_URL` to its origin and rebuild the userscript. Until then the Duel UI shows `not-configured` and performs no background network attempts.

## Next milestone

After a live `WELCOME` has been observed from the deployed server, implement queue membership and the 30-second ready check. Drafting remains the following milestone.
