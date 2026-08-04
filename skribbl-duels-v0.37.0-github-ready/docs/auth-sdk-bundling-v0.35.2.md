# Auth SDK bundling v0.35.2

## Incident

The v0.35.1 userscript loaded the Supabase UMD SDK through Tampermonkey `@require` and then read only `window.supabase`. In the live userscript context, the SDK variable was not exposed on `window`, so authentication stopped before any Supabase or Discord request with:

```text
Supabase client library was not loaded.
```

This was a client loading problem. It was unrelated to Discord scopes, email-confirmation settings, Supabase Auth service versions, or the configured Discord client secret.

## Fix

- `@supabase/supabase-js` is a pinned dependency of `@skribbl-duels/auth-client`.
- The TypeScript auth client imports `createClient` directly.
- Vite bundles the SDK into the installable userscript.
- The external Supabase `@require` metadata entry is removed.
- The SystemJS runtime required by the SDK's internal dynamic import is inlined instead of added as another external `@require`.
- Authentication no longer reads `window.supabase` or depends on CDN/global timing.
- The runtime regression test initializes login while `window.supabase` is absent.

## Verification

The release contract remains:

```text
npm ci
npm run typecheck
npm test
npm run build
```

The built userscript must contain no external `@require` metadata entry and must include the bundled client implementation.
