import * as assert from 'node:assert/strict';
import {
  SupabaseDiscordAuthClient,
  type SupabaseAuthClientLike,
  type SupabaseBrowserLibrary,
  type SupabaseSessionLike
} from '@skribbl-duels/auth-client';

let authCallback: ((event: string, session: SupabaseSessionLike | null) => void) | null = null;
let signInInput: Parameters<SupabaseAuthClientLike['signInWithOAuth']>[0] | null = null;
let signedOut = false;
let createClientCalls = 0;

const session: SupabaseSessionLike = {
  access_token: 'test-access-token',
  expires_at: 2_000_000_000,
  user: {
    id: 'supabase-user-1',
    email: 'alpha@example.test',
    user_metadata: {
      provider_id: 'discord-123',
      user_name: 'alpha_dev',
      full_name: 'Alpha',
      avatar_url: 'https://cdn.example/avatar.png'
    }
  }
};

const createClient: SupabaseBrowserLibrary['createClient'] = (url, key, options) => {
    createClientCalls += 1;
    assert.equal(url, 'https://kryznzijjlqkixdxqkft.supabase.co');
    assert.match(key, /^sb_publishable_/);
    assert.equal(options.auth.flowType, 'implicit');
    assert.equal(options.auth.detectSessionInUrl, true);
    return {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        async signInWithOAuth(input) {
          signInInput = input;
          return { data: { provider: 'discord' }, error: null };
        },
        async signOut() {
          signedOut = true;
          return { error: null };
        },
        onAuthStateChange(callback) {
          authCallback = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        }
      }
    };
};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {}
});

const client = new SupabaseDiscordAuthClient(createClient);
await client.signInWithDiscord();
assert.equal(createClientCalls, 1, 'Login should initialize without a window.supabase global.');
assert.equal(client.getState().status, 'initializing');
assert.deepEqual(signInInput, {
  provider: 'discord',
  options: {
    redirectTo: 'https://skribbl.io/',
    scopes: 'identify email'
  }
});

const callback = authCallback as unknown as (event: string, session: SupabaseSessionLike | null) => void;
assert.equal(typeof callback, 'function');
callback('SIGNED_IN', session);
const state = client.getState();
assert.equal(state.status, 'signed-in');
assert.equal(state.profile?.displayName, 'Alpha');
assert.equal(state.profile?.discordId, 'discord-123');
assert.equal(client.getAccessToken(), 'test-access-token');

await client.signOut();
assert.equal(signedOut, true);
assert.equal(client.getState().status, 'signed-out');

console.log(JSON.stringify({
  bundledSdk: true,
  discordOAuth: true,
  sessionRestore: true,
  gatewayAccessToken: true,
  signOut: true
}, null, 2));
