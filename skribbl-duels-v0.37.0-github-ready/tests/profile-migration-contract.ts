import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/202608040001_create_skribbl_duels_profiles.sql'
);
const migration = await readFile(migrationPath, 'utf8');

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

console.log(JSON.stringify({
  profileTable: true,
  authUserForeignKey: true,
  rlsEnabled: true,
  authenticatedReadOnly: true,
  trustedTriggerSync: true,
  existingUserBackfill: true,
  noEmailCopy: true
}, null, 2));
