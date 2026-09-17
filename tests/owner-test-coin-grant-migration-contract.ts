import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile('supabase/migrations/202609170002_grant_analphabetism_slot_test_coins.sql', 'utf8');

assert.match(sql, /c27ea4b9-984e-4efb-bfba-e9f77b28f1f4/);
assert.match(sql, /owner-test-grant:v0\.66\.1:analphabetism-slots/);
assert.match(sql, /\n\s*99999,\s*\n/);
assert.match(sql, /'earn'/);
assert.match(sql, /'owner-testing-grant'/);
assert.match(sql, /public\.apply_skribbl_coin_transaction/);
assert.doesNotMatch(sql, /update\s+public\.skribbl_coin_accounts/i, 'The grant must enter through the append-only ledger.');
assert.doesNotMatch(sql, /grant\s+(all|execute)/i, 'The migration must not create a reusable owner privilege.');

console.log('Idempotent analphabetism Slots test-Coin grant migration contract passed.');
