import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile('supabase/migrations/202609160001_create_skribbl_coin_ledger.sql', 'utf8');

for (const required of [
  'skribbl_coin_accounts',
  'skribbl_coin_transactions',
  'idempotency_key',
  'balance_before',
  'balance_after',
  'rules_version',
  'reversal_of_transaction_id',
  'reject_skribbl_coin_transaction_mutation',
  'apply_skribbl_coin_transaction',
  'skribble_daily_words',
  'skribble_daily_runs',
  'request_ids'
]) {
  assert.ok(sql.includes(required), `Progression migration is missing ${required}.`);
}
assert.match(sql, /unique \(account_id, idempotency_key\)/i);
assert.ok(
  (sql.match(/select \* into v_existing/gi) ?? []).length >= 2,
  'Idempotency must be rechecked after acquiring the account row lock.'
);
assert.match(sql, /before update or delete on public\.skribbl_coin_transactions/i);
assert.match(sql, /v_account\.balance \+ p_amount < 0/i);
assert.match(sql, /grant execute on function public\.apply_skribbl_coin_transaction/i);
assert.match(sql, /revoke all on public\.skribbl_coin_transactions from public, anon, authenticated/i);
assert.doesNotMatch(
  sql,
  /skribbl_coin_accounts \([\s\S]*?account_id uuid primary key references auth\.users/i,
  'Deleting an auth identity must not cascade into the append-only Coin audit log.'
);

console.log('Append-only Skribbl Coin ledger migration contract passed.');
