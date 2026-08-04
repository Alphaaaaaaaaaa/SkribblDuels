# Auth Foundation v0.35.0

## Architecture

```text
SD panel
→ Supabase browser client
→ Discord OAuth
→ Supabase callback
→ https://skribbl.io/
→ persisted browser session
→ future Gateway HELLO with Supabase access token
```

This is a development browser flow. It intentionally uses the public project URL and publishable key only.

## Public configuration

Defined in `packages/auth-client/src/config.ts`:

- Supabase project URL
- Supabase publishable key
- Redirect URL `https://skribbl.io/`
- Versioned browser storage key

## Not allowed in client code

- Discord client secret
- Supabase database password
- Supabase secret key / service-role key
- Direct Postgres connection string

## UI

The Duel tab contains:

- session initialization state
- Sign in with Discord
- Discord profile/avatar after login
- Sign out
- visible authentication errors

## Public API

```js
skribblDuelsProduct.auth.getState()
skribblDuelsProduct.auth.subscribe(listener)
skribblDuelsProduct.auth.signInWithDiscord()
skribblDuelsProduct.auth.signOut()
skribblDuelsProduct.auth.getAccessToken()
```

The access token is intended for a later short-lived authenticated Gateway connection. It must not be logged or inserted into chat.

## Redirect configuration

Supabase must allow the exact redirect URL:

```text
https://skribbl.io/
```

The OAuth flow currently performs a full-page redirect. A later dedicated auth web page can replace this without changing the public auth API.
