import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/202608040001_create_skribbl_duels_profiles.sql'
);
const migration = await readFile(migrationPath, 'utf8');
const expansion = await readFile(resolve(
  process.cwd(),
  'supabase/migrations/202608050001_expand_skribbl_duels_profiles.sql'
), 'utf8');
const asciiNames = await readFile(resolve(
  process.cwd(),
  'supabase/migrations/202608050002_enforce_ascii_duel_names.sql'
), 'utf8');

assert.match(migration, /create table if not exists public\.profiles/i);
assert.match(migration, /id uuid primary key references auth\.users\(id\) on delete cascade/i);
assert.match(migration, /discord_id text unique/i);
assert.match(migration, /alter table public\.profiles enable row level security/i);
assert.match(migration, /revoke all on table public\.profiles from anon, authenticated/i);
assert.match(migration, /grant select on table public\.profiles to authenticated/i);
assert.match(migration, /for select\s+to authenticated\s+using \(true\)/i);
assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /after insert or update of raw_user_meta_data, raw_app_meta_data/i);
assert.match(migration, /from auth\.users as auth_user/i);
assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all).*to authenticated/i);
assert.doesNotMatch(migration, /\bemail\b/i);
assert.match(expansion, /preferred_language text not null default 'en'/i);
assert.match(expansion, /avatar_source text not null default 'discord'/i);
assert.match(expansion, /skribbl_avatar smallint\[\]/i);
assert.match(expansion, /create unique index if not exists profiles_display_name_unique_ci/i);
assert.match(expansion, /create table if not exists public\.avatar_special_entitlements/i);
assert.match(expansion, /special avatar is not entitled/i);
assert.match(expansion, /create or replace function public\.update_skribbl_duels_profile/i);
assert.doesNotMatch(expansion, /grant\s+(insert|update|delete|all).*profiles.*to authenticated/i);
assert.match(asciiNames, /profiles_display_name_ascii_alphanumeric/i);
assert.match(asciiNames, /\^\[A-Za-z0-9\]\{3,24\}\$/i);
assert.match(asciiNames, /'User' \|\| left\(replace\(id::text, '-', ''\), 20\)/i);
assert.match(asciiNames, /duel_skribbl_avatar\[4\] >= 0/i);
assert.match(asciiNames, /special avatar is not entitled/i);
assert.doesNotMatch(asciiNames, /grant\s+(insert|update|delete|all).*profiles.*to authenticated/i);

console.log(JSON.stringify({
  profileTable: true,
  authUserForeignKey: true,
  rlsEnabled: true,
  authenticatedReadOnly: true,
  trustedTriggerSync: true,
  existingUserBackfill: true,
  noEmailCopy: true
  , customDuelProfile: true
  , specialAvatarEntitlements: true
  , asciiAlphanumericDuelNames: true
}, null, 2));
