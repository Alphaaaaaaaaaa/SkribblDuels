# Skribbl Duels project rules

## Commands

- Install reproducibly with `npm ci`.
- Run the TypeScript check with `npm run typecheck`.
- Run all tests with `npm test`.
- Build the installable userscript and deployable Gateway with `npm run build`.
- Run the local Gateway with `npm run dev:gateway` after creating `apps/gateway/.env`.
- Do not hand-edit files in `dist/`; rebuild them from TypeScript.

## Architecture boundaries

- Keep Skribbl Telemetry / Protocol State separate from Challenge / Duel logic.
- Challenge and Duel modules may consume only the versioned Telemetry Event Contract. They must not depend directly on Socket.IO packet IDs, skribbl.io DOM selectors, or page implementation details.
- Keep gateway messages versioned and validated. The Gateway is authoritative for identity, matchmaking, ready checks, drafts, claims, match results, ratings, and private Duel chat.
- Browser clients may submit telemetry and claim candidates but must not authoritatively award fields or results.

## Frozen product rules

- The active challenge pool contains 46 challenges. New challenges and rule changes must remain modular and versioned.
- Casual uses a 3x3 board and a five-field win target.
- Ranked uses a 5x5 board and a thirteen-field win target.
- Blind Guess and Drunk Vision must never appear on the same board. Express this through general conflict metadata, not UI-specific conditionals. Deaf Guess remains compatible with either challenge.
- Preserve the implemented 30-second ready check, 15-second draft selection timer, random starting player, and ten-second pre-match countdown.

## Security and configuration

- Never commit or bundle Discord client secrets, bot tokens, Supabase secret/service-role keys, database passwords, connection strings, access tokens, or refresh tokens.
- The Supabase project URL and publishable key are public browser configuration and may be embedded in the userscript.
- Only variables prefixed with `VITE_` may be read by the browser build. Treat all such variables as public.
- Give the Gateway its own environment file and example. Never share the browser environment file with server secrets.
- Send Supabase access tokens only through Socket.IO handshake auth. Never include them in Contract messages, logs, errors, URLs, or persisted state.

## Change discipline

- Preserve unrelated behavior and user changes.
- Add or update a regression test for every bug fix.
- Keep version strings and the userscript metadata version synchronized.
- Update the relevant document under `docs/` when an architecture contract or setup requirement changes.
