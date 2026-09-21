import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  'supabase/migrations/202609210001_upgrade_skribbl_slots_rules_v2.sql',
  'utf8'
);

assert.match(sql, /^begin;/i);
assert.match(sql, /commit;\s*$/i);
assert.match(sql, /check \(coin_reward between 0 and 100\)/i);
assert.match(sql, /p_rules_version is null\s+or p_rules_version not in \(1, 2\)/i);
for (const [icon, reward] of [
  ['skribbl-coin', 100], ['7', 77], ['trophy', 50], ['crown', 50],
  ['pen', 40], ['skribbl-duels-logo', 40], ['potion', 30], ['drop', 30],
  ['pizza', 20], ['pumpkin', 20], ['eggplant', 20], ['pineapple', 10],
  ['peach', 10], ['ribbon', 10]
] as const) {
  assert.match(sql, new RegExp(`when '${icon}' then ${reward}`));
}
assert.match(
  sql,
  /create or replace function public\.apply_skribbl_slot_spin[\s\S]*security definer[\s\S]*set search_path = ''/i
);
assert.match(
  sql,
  /revoke all on function public\.apply_skribbl_slot_spin[\s\S]*from public, anon, authenticated/i
);
assert.match(
  sql,
  /grant execute on function public\.apply_skribbl_slot_spin[\s\S]*to service_role/i
);

console.log('Skribbl Slots rules v2 migration payout and security contract passed.');
