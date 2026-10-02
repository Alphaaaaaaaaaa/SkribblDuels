import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { SupabaseGatewaySocialPersistence } from '../apps/gateway/src/socialPersistence';

const db = new PGlite();
const alpha = '00000000-0000-4000-8000-000000000001';
const bravo = '00000000-0000-4000-8000-000000000002';
const charlie = '00000000-0000-4000-8000-000000000003';
const migration = await readFile('supabase/migrations/202610010003_social_lobby_join_permissions.sql', 'utf8');
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.profiles(id uuid primary key);');
  for (const file of ['202609300001_add_social_graph.sql', '202610010001_fix_social_friend_response.sql', '202610010002_add_friend_chat_history.sql']) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.query('insert into public.profiles(id) values($1),($2),($3)', [alpha, bravo, charlie]);
  await db.query('insert into public.duel_social_preferences(profile_id,allow_lobby_join) values($1,true),($2,false)', [alpha, bravo]);
  const persistence = new SupabaseGatewaySocialPersistence('https://supabase.example', 'test-service-role');
  Object.defineProperty(persistence, 'client', { value: {
    async rpc(name: string) {
      assert.equal(name, 'gateway_social_contract_version');
      return { data: (await db.query<{ version: number }>('select public.gateway_social_contract_version() as version')).rows[0]!.version, error: null };
    },
    from(table: string) {
      assert.equal(table, 'duel_social_preferences');
      let id = ''; let values: Record<string, unknown> | null = null; let insert = false;
      const query = {
        select() { return query; },
        eq(field: string, value: string) { assert.equal(field, 'profile_id'); id = value; return query; },
        update(value: Record<string, unknown>) { values = value; return query; },
        upsert(value: { profile_id: string }) { id = value.profile_id; insert = true; return query; },
        async limit() { return { error: null }; },
        async maybeSingle() {
          if (insert) await db.query('insert into public.duel_social_preferences(profile_id) values($1) on conflict do nothing', [id]);
          if (values) {
            const keys = Object.keys(values);
            assert.ok(keys.every(key => /^[a-z_]+$/.test(key)));
            await db.query(`update public.duel_social_preferences set ${keys.map((key, i) => `${key}=$${i + 2}`).join(',')} where profile_id=$1`, [id, ...Object.values(values)]);
          }
          return { data: (await db.query('select * from public.duel_social_preferences where profile_id=$1', [id])).rows[0] ?? null, error: null };
        },
        async single() { return query.maybeSingle(); }
      };
      return query;
    }
  } });
  await assert.rejects(persistence.checkHealth(), /Social Contract v18 is required.*v17/);
  await db.exec(migration); await persistence.checkHealth();
  const initial = await persistence.getPreferences(alpha);
  assert.equal(initial.lobbyJoinMode, 'public', 'Previously allowed public lobbies stay public-only.');
  assert.equal((await persistence.getPreferences(bravo)).lobbyJoinMode, 'none', 'A previous opt-out remains disabled.');
  const privatePreferences = await persistence.setPreferences(alpha, { ...initial, lobbyJoinMode: 'private' });
  assert.equal(privatePreferences.lobbyJoinMode, 'private'); assert.ok(privatePreferences.revision > initial.revision);
  await db.exec(migration); assert.equal((await persistence.getPreferences(alpha)).lobbyJoinMode, 'private', 'Reapplying the migration preserves explicit private-lobby permission.');
  assert.equal((await persistence.getPreferences(charlie)).lobbyJoinMode, 'public', 'New preferences use the privacy-preserving default.');
  const disabled = await persistence.setPreferences(alpha, { ...initial, lobbyJoinMode: 'none' });
  assert.equal(disabled.lobbyJoinMode, 'none');
  assert.equal((await db.query<{ allow_lobby_join: boolean }>('select allow_lobby_join from public.duel_social_preferences where profile_id=$1', [alpha])).rows[0]!.allow_lobby_join, false);
  await assert.rejects(db.query("update public.duel_social_preferences set lobby_join_mode='everything' where profile_id=$1", [alpha]), /check constraint/);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select public.gateway_social_contract_version()'), /permission denied/);
    await assert.rejects(db.query('select * from public.duel_social_preferences'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal((await db.query<{ version: number }>('select public.gateway_social_contract_version() as version')).rows[0]!.version, 18);
  console.log('v0.72.0: real PostgreSQL migration, opt-out preservation, private opt-in, revision, role permissions and Contract 18 health check passed.');
} finally { await db.close(); }
