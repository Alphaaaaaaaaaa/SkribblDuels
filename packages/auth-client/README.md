# @skribbl-duels/auth-client

Browser-side Supabase Auth wrapper for Skribbl Duels. It exposes Discord OAuth, session/profile state, sign-out, and the current access token for the future authoritative gateway.

Only the public Supabase project URL and publishable key belong in this package. Discord client secrets, Supabase secret/service keys, and the database password must never be included in client code.
