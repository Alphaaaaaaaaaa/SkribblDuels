# Backend Architecture Decision Guide v0.34.0

## Recommended first production stack

```text
Discord OAuth
→ Supabase Auth
→ Supabase Postgres for accounts, profiles, match history and ratings
→ Node.js + Socket.IO authoritative Duel gateway
→ Railway deployment
```

The gateway validates the user's Supabase access token, owns matchmaking and live match state, validates claim candidates, broadcasts authoritative revisions and persists final results to Postgres.

## Alternative edge-native stack

```text
Discord OAuth / Supabase Auth
→ Cloudflare Worker
→ one Durable Object per Duel match
→ hibernatable WebSockets
→ Supabase Postgres for long-term data
```

This maps rooms naturally to single authoritative objects but is more specialized than a conventional Node server.

## Minimum database entities

- `profiles`
- `ratings`
- `matches`
- `match_players`
- `match_boards`
- `challenge_claims`
- `match_events` or compact audit records
- optional moderation/ban tables

## OAuth rule

Never place a Discord client secret in the userscript. The browser starts login through the auth provider. The server or managed auth provider performs the authorization-code exchange. The userscript receives only a short-lived application session/access token.
