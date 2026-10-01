import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile('supabase/migrations/202609300001_add_social_graph.sql', 'utf8');

for (const table of [
  'duel_social_preferences',
  'duel_friend_requests',
  'duel_friendships',
  'duel_friend_pins',
  'duel_social_blocks'
]) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`, 'i'));
}

assert.match(sql, /duel_friend_requests_active_pair[\s\S]*least\(sender_id, recipient_id\)[\s\S]*greatest\(sender_id, recipient_id\)/i);
assert.match(sql, /primary key \(account_low, account_high\)/i);
assert.match(sql, /constraint duel_friendship_canonical_pair check \(account_low::text < account_high::text\)/i);
assert.match(sql, /status in \('pending', 'ignored', 'accepted', 'declined', 'withdrawn', 'blocked'\)/i);
assert.match(sql, /create or replace function public\.gateway_respond_duel_friend_request/i);
assert.match(sql, /for update;/i, 'Friend-request responses must lock the durable request row.');
assert.match(sql, /security definer set search_path = ''/i);
assert.match(sql, /revoke all on function public\.gateway_respond_duel_friend_request\(uuid,uuid,text\) from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.gateway_respond_duel_friend_request\(uuid,uuid,text\) to service_role/i);
assert.match(sql, /create or replace function public\.touch_duel_social_preferences\(\)[\s\S]*set search_path = ''/i);
assert.match(sql, /^begin;/i);
assert.match(sql, /commit;\s*$/i);

console.log('v0.69.0 durable social graph migration contract passed.');
