import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile('supabase/migrations/202609170001_add_skribbl_slots_and_harden_functions.sql', 'utf8');

for (const required of [
  'skribbl_slot_accounts',
  'skribbl_slot_spins',
  'effect_steps',
  'used_free_spin',
  'awarded_free_spins',
  'book_free_spins',
  'slimy_free_spins',
  'heart_free_spins',
  'used_free_spin_source',
  'next_free_spin_source',
  'heart_progress_before',
  'heart_progress_after',
  'apply_skribbl_slot_spin',
  'reject_skribbl_slot_spin_mutation'
]) {
  assert.ok(sql.includes(required), `Slots migration is missing ${required}.`);
}
assert.match(sql, /unique \(account_id, request_id\)/i);
assert.match(sql, /before update or delete on public\.skribbl_slot_spins/i);
assert.match(sql, /where account_id = p_account_id for update/i);
assert.match(sql, /SCD_SLOTS_INSUFFICIENT_COINS/);
assert.match(sql, /create or replace function public\.apply_skribbl_slot_spin[\s\S]*security definer[\s\S]*set search_path = ''/i);
assert.match(sql, /revoke all on function public\.apply_skribbl_slot_spin[\s\S]*from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.apply_skribbl_slot_spin[\s\S]*to service_role/i);
assert.doesNotMatch(sql, /grant execute on function public\.apply_skribbl_slot_spin[^;]*to authenticated/i);

assert.match(sql, /alter function public\.reject_skribbl_coin_transaction_mutation\(\) set search_path = ''/i);
assert.match(sql, /create or replace function public\.update_skribbl_duels_profile[\s\S]*security invoker[\s\S]*set search_path = ''/i);
assert.doesNotMatch(
  sql,
  /create or replace function public\.update_skribbl_duels_profile[\s\S]*security definer/i,
  'Authenticated profile updates must no longer expose a SECURITY DEFINER RPC.'
);
assert.match(sql, /create policy skribbl_duels_profiles_update_own/i);
assert.match(sql, /create trigger validate_skribbl_duels_profile_update/i);

console.log('Skribbl Slots ledger and Supabase lint-hardening migration contract passed.');
