# Supabase database files

Apply migrations in filename order. For the current hosted development project, paste the complete migration into the Supabase SQL Editor and run it once.

After applying a migration, run the matching verification script before changing the userscript or starting the Gateway.

The `public.profiles` table deliberately contains no email address, access token, refresh token, rating, match result, or moderation state. Browser clients can read profiles after authentication but cannot write profile identity fields.
