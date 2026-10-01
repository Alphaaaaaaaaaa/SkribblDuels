import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile('supabase/migrations/202610010001_fix_social_friend_response.sql', 'utf8');

assert.match(sql, /^begin;/i);
assert.match(sql, /create or replace function public\.gateway_respond_duel_friend_request/i);
assert.match(sql, /select request_row\.\* into target[\s\S]*from public\.duel_friend_requests as request_row/i);
assert.match(sql, /where request_row\.request_id = target_request_id[\s\S]*request_row\.recipient_id = actor_id/i);
assert.match(sql, /update public\.duel_friend_requests as request_row[\s\S]*where request_row\.request_id = target_request_id/i);
assert.doesNotMatch(sql, /where\s+request_id\s*=\s*target_request_id/i,
  'The response RPC must never reintroduce an output-variable/column ambiguity.');
assert.match(sql, /for update;/i);
assert.match(sql, /security definer set search_path = ''/i);
assert.match(sql, /revoke all on function public\.gateway_respond_duel_friend_request\(uuid,uuid,text\) from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.gateway_respond_duel_friend_request\(uuid,uuid,text\) to service_role/i);

assert.match(sql, /create or replace function public\.gateway_social_contract_version\(\)[\s\S]*returns integer[\s\S]*select 16;/i);
assert.match(sql, /gateway_social_contract_version\(\)[\s\S]*security invoker set search_path = ''/i);
assert.match(sql, /revoke all on function public\.gateway_social_contract_version\(\) from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.gateway_social_contract_version\(\) to service_role/i);
assert.match(sql, /commit;\s*$/i);

console.log('v0.69.1 qualified friend-response RPC and Social Contract v16 health probe passed.');
