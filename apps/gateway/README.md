# Skribbl Duels Gateway

The first authoritative Gateway milestone accepts Socket.IO connections only after verifying the browser's Supabase access token. It then loads the matching read-only `public.profiles` row and returns a Contract v1 `WELCOME`.

## Local server

1. Copy `.env.example` to `.env`.
2. Run `npm run dev:gateway` from the repository root.
3. Open `http://localhost:3000/healthz` to verify the process.

The local health endpoint does not prove a browser connection because `skribbl.io` needs a publicly trusted HTTPS Gateway. Deploy first, then build the userscript with `VITE_GATEWAY_URL` set to that public origin.

No Supabase secret/service-role key is needed in this milestone. Authentication uses `auth.getClaims(accessToken)`, and profile lookup runs with the same user's bearer token so the existing RLS policy remains active.
