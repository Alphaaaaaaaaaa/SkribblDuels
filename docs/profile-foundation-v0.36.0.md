# Profile Foundation v0.36.0

## Goal

Create one persistent Skribbl Duels profile for every Supabase Auth user before the authoritative Gateway is introduced.

## Data model

```text
public.profiles
├── id           → auth.users.id (primary key, delete cascade)
├── discord_id   → verified Discord provider ID
├── username     → Discord username
├── display_name → Discord display name
├── avatar_url   → Discord avatar
├── created_at
└── updated_at
```

Email addresses remain in Supabase Auth and are not copied into the public profile table. Ratings, match history, sanctions, and moderation state will use separate server-owned tables in later migrations.

## Write ownership

The browser has authenticated `SELECT` access only. It receives no `INSERT`, `UPDATE`, or `DELETE` table privilege and no write policy.

`public.sync_skribbl_duels_profile()` is a `security definer` trigger function with an empty `search_path`. It copies the supported identity fields from `auth.users` after a user is created or their provider metadata changes.

This prevents a modified userscript from replacing its trusted Discord ID or identity fields.

## Existing user backfill

The migration inserts profiles for all Auth users that existed before v0.36.0. This includes the account used to complete the first successful Discord OAuth test.

## Apply in the hosted project

1. Open the Supabase project.
2. Open **SQL Editor**.
3. Choose **New query**.
4. Paste all of `supabase/migrations/202608040001_create_skribbl_duels_profiles.sql`.
5. Choose **Run** once.
6. Open a second new query.
7. Paste all of `supabase/verify_profiles.sql`.
8. Choose **Run**.

Expected verification:

| Result | Expected value |
| --- | --- |
| `profiles_table_exists` | `true` |
| `rls_enabled` | `true` |
| `anon_can_read` | `false` |
| `authenticated_can_read` | `true` |
| `authenticated_can_insert` | `false` |
| `authenticated_can_update` | `false` |
| `authenticated_can_delete` | `false` |
| `auth_user_count` | same as `profile_count` |

The verification now returns one result table. `recent_profiles` contains the existing Discord account with a Discord ID, username, display name, and avatar status. This avoids the Supabase SQL Editor showing only the second of two result sets.

## Next milestone

After this verification succeeds, create `apps/gateway` and prove the smallest authoritative network path:

```text
Supabase session → Socket.IO handshake → JWT verification → profile lookup → WELCOME
```

Matchmaking and the 30-second ready check begin only after that path is stable.
