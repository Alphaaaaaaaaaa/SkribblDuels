import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { SupabaseGatewaySocialPersistence, SocialPersistenceError } from '../apps/gateway/src/socialPersistence';

const db = new PGlite();
const alpha = '00000000-0000-4000-8000-000000000001';
const bravo = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles (id uuid primary key);`);
  for (const file of ['202609300001_add_social_graph.sql', '202610010001_fix_social_friend_response.sql', '202610010002_add_friend_chat_history.sql']) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  // The additive migration is safe to reapply.
  await db.exec(await readFile('supabase/migrations/202610010002_add_friend_chat_history.sql', 'utf8'));
  assert.equal((await db.query<{ version: number }>('select public.gateway_social_contract_version() as version')).rows[0]?.version, 17);
  await db.query('insert into public.profiles(id) values ($1),($2),($3)', [alpha, bravo, outsider]);
  const request = await db.query<{ request_id: string }>('insert into public.duel_friend_requests(sender_id,recipient_id) values($1,$2) returning request_id', [alpha, bravo]);
  await db.query("select * from public.gateway_respond_duel_friend_request($1,$2,'accept')", [bravo, request.rows[0]!.request_id]);

  const persistence = new SupabaseGatewaySocialPersistence('https://supabase.example', 'test-service-role');
  Object.defineProperty(persistence, 'client', { value: {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const calls: Record<string, [string, unknown[]]> = {
        gateway_store_duel_friend_message: ['select * from public.gateway_store_duel_friend_message($1,$2,$3,$4)', [args.actor_id, args.target_id, args.client_id, args.body]],
        gateway_get_duel_friend_messages: ['select * from public.gateway_get_duel_friend_messages($1,$2,$3)', [args.actor_id, args.target_id, args.before_seq]],
        gateway_duel_friend_chat_inbox: ['select * from public.gateway_duel_friend_chat_inbox($1)', [args.actor_id]],
        gateway_purge_duel_friend_messages: ['select public.gateway_purge_duel_friend_messages()', []]
      };
      const call = calls[name]; assert.ok(call, name);
      try { return { data: (await db.query(call[0], call[1])).rows, error: null }; }
      catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : String(error) } }; }
    }
  } });
  const message = await persistence.storeMessage(alpha, bravo, 'first', '<img onerror="bad()"> :slot/heart:');
  assert.equal(message.senderId, alpha); assert.equal(message.recipientId, bravo);
  assert.ok(message.sequence > 0); assert.equal(message.readAt, null);
  assert.deepEqual(await persistence.storeMessage(alpha, bravo, 'first', message.message), message, 'Retries must return the stored message without duplicate rows.');
  await assert.rejects(persistence.storeMessage(alpha, bravo, 'first', 'Changed body'), (error: unknown) => error instanceof SocialPersistenceError && error.code === 'FRIEND_MESSAGE_ID_CONFLICT');
  await assert.rejects(persistence.storeMessage(outsider, bravo, 'outsider', 'Hello'), (error: unknown) => error instanceof SocialPersistenceError && error.code === 'FRIEND_NOT_FOUND');
  assert.deepEqual(await persistence.getUnreadMessages(bravo), [{ accountId: alpha, count: 1 }]);
  assert.equal((await persistence.getMessageHistory(outsider, alpha, null)).messages.length, 0, 'Unrelated accounts cannot retrieve a conversation.');

  // The browser roles cannot read the table or call the privileged RPC directly.
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.duel_friend_messages'), /permission denied/);
  await assert.rejects(db.query('select * from public.gateway_get_duel_friend_messages($1,$2,null)', [alpha, bravo]), /permission denied/);
  await db.exec('reset role');
  await db.query('update public.duel_friend_messages set read_at=now() where recipient_id=$1 and message_sequence <= $2', [bravo, message.sequence]);
  assert.deepEqual(await persistence.getUnreadMessages(bravo), []);

  await db.query(`insert into public.duel_friend_messages(sender_id,recipient_id,client_message_id,message_text)
    select $1,$2,'page-'||n,'Message '||n from generate_series(1,401) as n`, [alpha, bravo]);
  await db.query(`insert into public.duel_friend_messages(sender_id,recipient_id,client_message_id,message_text,created_at)
    values($1,$2,'expired','Old message',now()-interval '25 hours')`, [alpha, bravo]);
  let cursor: number | null = null; const all = new Set<string>(); let pages = 0;
  do {
    const page = await persistence.getMessageHistory(alpha, bravo, cursor);
    assert.ok(page.messages.length <= 200);
    assert.deepEqual(page.messages.map(item => item.sequence), page.messages.map(item => item.sequence).sort((a,b) => a-b));
    for (const item of page.messages) { assert.notEqual(item.clientMessageId, 'expired'); assert.ok(!all.has(item.messageId)); all.add(item.messageId); }
    cursor = page.nextBeforeSequence; pages++;
  } while (cursor !== null);
  assert.equal(all.size, 402); assert.equal(pages, 3, 'Every message in the retention window must remain accessible through pagination.');
  await persistence.purgeMessages();
  assert.equal((await db.query<{ count: number }>('select count(*)::int as count from public.duel_friend_messages')).rows[0]!.count, 402);

  await db.query('insert into public.duel_social_blocks(blocker_id,blocked_id) values($1,$2)', [bravo, alpha]);
  assert.deepEqual(await persistence.getUnreadMessages(bravo), []);
  assert.equal((await persistence.getMessageHistory(alpha, bravo, null)).messages.length, 0);
  await assert.rejects(persistence.storeMessage(alpha, bravo, 'blocked', 'No'), (error: unknown) => error instanceof SocialPersistenceError && error.code === 'FRIEND_NOT_FOUND');
  await db.exec('delete from public.duel_social_blocks');

  // Bound a representative high-volume day, including four-byte Unicode bodies.
  await db.query(`insert into public.duel_friend_messages(sender_id,recipient_id,client_message_id,message_text)
    select $1,$2,'capacity-'||n,repeat('𝄞',300) from generate_series(1,19598) as n`, [alpha, bravo]);
  await assert.rejects(persistence.storeMessage(alpha, bravo, 'capacity-overflow', 'No'), (error: unknown) => error instanceof SocialPersistenceError && error.code === 'SOCIAL_CHAT_STORAGE_FULL');
  const size = (await db.query<{ bytes: number }>("select pg_total_relation_size('public.duel_friend_messages')::float8 as bytes")).rows[0]!.bytes;
  assert.ok(size < 64 * 1024 * 1024, `20,000 representative messages should fit below 64 MiB; got ${size}.`);
  assert.deepEqual(await persistence.storeMessage(alpha, bravo, 'first', message.message), { ...message, readAt: (await persistence.getMessageHistory(alpha, bravo, message.sequence + 1)).messages[0]!.readAt }, 'An accepted retry still works when capacity is full.');
  console.log(JSON.stringify({ postgresMigration: true, permissions: true, atomicSends: true, offlineInbox: true, pagination: true, retention24h: true, storageCap: 20000, representativeTableBytes: size }));
} finally { await db.close(); }
