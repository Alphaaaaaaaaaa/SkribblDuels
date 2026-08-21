import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/202608210001_create_gateway_abuse_controls.sql',
  'utf8'
).toLowerCase();

for (const required of [
  'create table if not exists public.duel_abuse_signals',
  'create table if not exists public.duel_account_sanctions',
  'alter table public.duel_abuse_signals enable row level security',
  'revoke all on public.duel_account_sanctions from anon, authenticated',
  'create or replace function public.purge_duel_operational_data',
  "if auth.role() <> 'service_role'",
  "interval '90 days'",
  "interval '30 days'",
  'delete from public.duel_match_authority',
  'delete from public.duel_invites'
]) {
  assert.ok(migration.includes(required), `Gateway abuse migration is missing: ${required}`);
}

console.log('Gateway abuse-control migration contract passed.');
