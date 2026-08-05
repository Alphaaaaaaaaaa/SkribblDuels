# Supabase database files

Apply migrations in filename order. For the current hosted development project, paste the complete migration into the Supabase SQL Editor and run it once.

After v0.44.0, apply `202608050002_enforce_ascii_duel_names.sql`. It limits
Duel display names to 3–24 ASCII alphanumeric characters and replaces an older
incompatible name with a deterministic account-specific fallback.

After applying a migration, run the matching verification script before changing the userscript or starting the Gateway.

The `public.profiles` table deliberately contains no email address, access token, refresh token, rating, match result, or moderation state. Browser clients can read profiles after authentication but cannot write profile identity fields.
