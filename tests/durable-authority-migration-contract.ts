import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/202608190001_create_durable_match_authority.sql',
  'utf8'
);

for (const required of [
  'create table if not exists public.duel_match_authority',
  'create table if not exists public.duel_match_idempotency',
  'create table if not exists public.duel_match_authority_events',
  'create or replace function public.persist_duel_match_authority',
  'create or replace function public.finalize_duel_match_authority',
  "if auth.role() <> 'service_role'",
  'revoke all on public.duel_match_authority from anon, authenticated',
  'grant execute on function public.persist_duel_match_authority'
]) {
  assert.ok(migration.toLowerCase().includes(required.toLowerCase()), `Durable authority migration is missing: ${required}`);
}

assert.ok(migration.includes('on conflict (match_id) do update'));
assert.ok(migration.includes('where public.duel_match_authority.revision <= excluded.revision'));
assert.ok(migration.includes('primary key (match_id, namespace, account_id, idempotency_key)'));

console.log('Durable Match authority migration contract passed.');

