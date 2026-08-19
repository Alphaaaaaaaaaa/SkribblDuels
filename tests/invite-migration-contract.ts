import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../supabase/migrations/202608200001_create_duel_invites.sql', import.meta.url),
  'utf8'
);

assert.match(sql, /create table if not exists public\.duel_invites/i);
assert.match(sql, /token_hash text not null unique/i);
assert.doesNotMatch(sql, /invite_token|plain.*token/i, 'Only the invite token hash may be persisted.');
assert.match(sql, /for update/i, 'Accept and cancel must lock the invite before transitioning it.');
assert.match(sql, /creator_account_id = p_acceptor_account_id/i, 'Self-acceptance must be rejected atomically.');
assert.match(sql, /state = 'accepted'/i);
assert.match(sql, /accept_request_id = p_accept_request_id/i, 'Accept retries require a durable idempotency key.');
assert.match(sql, /auth\.role\(\) <> 'service_role'/i);
assert.match(sql, /enable row level security/i);

console.log('Invite migration contract passed.');
