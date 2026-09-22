# @skribbl-duels/auth-client

Browser-side Supabase Auth wrapper for Skribbl Duels. It exposes PKCE-based
Discord OAuth, persisted session/profile state, sign-out, and the current
access token for the authoritative Gateway. The userscript starts one shared
instance before asynchronous local-state restoration. The callback code is
exchanged explicitly and PKCE/session storage is mirrored across same-origin
local and session storage so Firefox userscript startup cannot silently turn a
callback failure into an ordinary signed-out state.

Only the public Supabase project URL and publishable key belong in this package. Discord client secrets, Supabase secret/service keys, and the database password must never be included in client code.
