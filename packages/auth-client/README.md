# @skribbl-duels/auth-client

Browser-side Supabase Auth wrapper for Skribbl Duels. It exposes PKCE-based
Discord OAuth, persisted session/profile state, sign-out, and the current
access token for the authoritative Gateway. The userscript starts one shared
instance before asynchronous local-state restoration so redirect callbacks are
not lost during Firefox page startup.

Only the public Supabase project URL and publishable key belong in this package. Discord client secrets, Supabase secret/service keys, and the database password must never be included in client code.
