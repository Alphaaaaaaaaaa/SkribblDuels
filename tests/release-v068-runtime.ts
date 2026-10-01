import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [auth, authTypes, migration, skribble, slots, userscript, product, rootPackage] = await Promise.all([
  readFile('packages/auth-client/src/supabaseDiscordAuth.ts', 'utf8'),
  readFile('packages/auth-client/src/types.ts', 'utf8'),
  readFile('supabase/migrations/202609220001_harden_discord_profile_sync.sql', 'utf8'),
  readFile('apps/telemetry-inspector/src/skribbleUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/slotsUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/userscript.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/duelProductUi.ts', 'utf8'),
  readFile('package.json', 'utf8')
]);

assert.match(authTypes, /AUTH_CLIENT_VERSION = '0\.38\.0'/);
assert.match(auth, /createResilientAuthStorage/);
assert.match(auth, /browserStorage\('localStorage'\)/);
assert.match(auth, /browserStorage\('sessionStorage'\)/);
assert.match(auth, /detectSessionInUrl: false/);
assert.match(auth, /exchangeCodeForSession\(callback\.code\)/);
assert.match(auth, /Please retry Discord authorization/);
assert.doesNotMatch(auth, /scopes:\s*['"](?:identify|email)/);

assert.match(migration, /^begin;/i);
assert.match(migration, /profile_username := left\(coalesce/i);
assert.match(migration, /regexp_replace\(coalesce[\s\S]*'\[\^A-Za-z0-9\]'/i);
assert.match(migration, /profile_display_name := 'User' \|\| left\(replace\(new\.id::text/i);
assert.match(migration, /from auth\.users auth_user[\s\S]*where not exists/i);
assert.match(migration, /revoke all on function public\.sync_skribbl_duels_profile\(\)[\s\S]*authenticated/i);
assert.match(migration, /commit;\s*$/i);

assert.match(skribble, /SKRIBBLE_LOSS_PAIR_INTERVAL_MS = 50/);
assert.match(skribble, /SKRIBBLE_LOSS_MESSAGE_DURATION_MS = 560/);
assert.match(skribble, /codePoints\('You lose!'\)/);
assert.match(skribble, /const fallFinishedAt/);
assert.match(skribble, /board\.animate\(/);

assert.match(slots, /content\.classList\.add\('help-view'\)/);
assert.match(slots, /Return to Skribbl Slots/);
assert.match(slots, /if \(SLOT_EFFECT_ICONS\.has\(icon\)\) return 'Effect'/);
assert.match(slots, /if \(icon === 'heart'\) return '3 for 1 Free Spin'/);
assert.match(slots, /return 'Nothing'/);
assert.match(slots, /background-color:var\(--COLOR_INPUT_BG,#fff\)/);
assert.match(slots, /@keyframes scd-slot-heart/);
assert.ok(
  slots.indexOf("classList.add('effect-heart')") < slots.indexOf('heartProgress: progress'),
  'Heart progress changes only after the smooth reel animation begins.'
);

assert.match(userscript, /BUILD_VERSION = '0\.69\.0'/);
assert.match(product, /version: '0\.69\.0'/);
assert.equal(JSON.parse(rootPackage).version, '0.69.0');

console.log('v0.68.0 Firefox OAuth hardening and terminal/Slots UI regressions remain intact in v0.69.0.');
