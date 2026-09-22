import * as assert from 'node:assert/strict';
import {
  SupabaseDiscordAuthClient,
  validateDuelDisplayName,
  type SupabaseAuthClientLike,
  type SupabaseBrowserLibrary,
  type SupabaseSessionLike
} from '@skribbl-duels/auth-client';

assert.equal(validateDuelDisplayName('Alpha2026'), null);
assert.equal(validateDuelDisplayName('Al'), 'too-short');
assert.equal(validateDuelDisplayName('A'.repeat(25)), 'too-long');
assert.equal(validateDuelDisplayName('Alpha_2026'), 'non-alphanumeric');
assert.equal(validateDuelDisplayName('Älpha'), 'non-alphanumeric');

let authCallback: ((event: string, session: SupabaseSessionLike | null) => void) | null = null;
let signInInput: Parameters<SupabaseAuthClientLike['signInWithOAuth']>[0] | null = null;
let signedOut = false;
let createClientCalls = 0;
let exchangedCode: string | null = null;

const session: SupabaseSessionLike = {
  access_token: 'test-access-token',
  expires_at: 2_000_000_000,
  user: {
    id: 'supabase-user-1',
    created_at: '2026-01-02T03:04:05.000Z',
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
    assert.equal(options.auth.flowType, 'pkce');
    assert.equal(options.auth.detectSessionInUrl, false);
    assert.equal(typeof options.auth.storage.getItem, 'function');
    assert.equal(typeof options.auth.storage.setItem, 'function');
    assert.equal(typeof options.auth.storage.removeItem, 'function');
    return {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        async exchangeCodeForSession(authCode) {
          exchangedCode = authCode;
          return { data: { session }, error: null };
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
    redirectTo: 'https://skribbl.io/'
  }
});

const callback = authCallback as unknown as (event: string, session: SupabaseSessionLike | null) => void;
assert.equal(typeof callback, 'function');
callback('SIGNED_IN', session);
const state = client.getState();
assert.equal(state.status, 'signed-in');
assert.equal(state.profile?.displayName, 'Alpha');
assert.equal(state.profile?.discordId, 'discord-123');
assert.equal(state.profile?.createdAt, Date.parse('2026-01-02T03:04:05.000Z'));
assert.equal(client.getAccessToken(), 'test-access-token');

await client.signOut();
assert.equal(signedOut, true);
assert.equal(client.getState().status, 'signed-out');

client.stop();
let replacedCallbackUrl = '';
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: { href: 'https://skribbl.io/?code=firefox-pkce-code' },
    history: {
      state: null,
      replaceState(_state: unknown, _unused: string, url: string) {
        replacedCallbackUrl = url;
      }
    }
  }
});
const callbackClient = new SupabaseDiscordAuthClient(createClient);
const callbackState = await callbackClient.start();
assert.equal(exchangedCode, 'firefox-pkce-code');
assert.equal(callbackState.status, 'signed-in');
assert.equal(callbackState.profile?.username, 'alpha_dev');
assert.equal(replacedCallbackUrl, 'https://skribbl.io/');
callbackClient.stop();

console.log(JSON.stringify({
  bundledSdk: true,
  discordOAuth: true,
  explicitPkceCallback: true,
  sessionRestore: true,
  gatewayAccessToken: true,
  asciiAlphanumericDuelNames: true,
  signOut: true
}, null, 2));
