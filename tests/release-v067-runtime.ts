import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [userscript, auth, skribble, slots] = await Promise.all([
  readFile('apps/telemetry-inspector/src/userscript.ts', 'utf8'),
  readFile('packages/auth-client/src/supabaseDiscordAuth.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/skribbleUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/slotsUi.ts', 'utf8')
]);

assert.match(auth, /flowType: 'pkce'/);
assert.doesNotMatch(auth, /scopes: 'identify'/);
const authStart = userscript.indexOf('void authClient.start();');
const bootstrapCall = userscript.indexOf('void bootstrap(runtime, authClient)');
assert.ok(authStart >= 0 && authStart < bootstrapCall);
assert.match(userscript, /void authClient\.start\(\);\s*void bootstrap\(runtime, authClient\)/);
assert.match(userscript, /authClient,/);

assert.match(skribble, /Math\.floor\(index \/ 2\) \* SKRIBBLE_LOSS_PAIR_INTERVAL_MS/);
assert.match(skribble, /const SKRIBBLE_LOSS_PAIR_INTERVAL_MS = 100;/);
assert.match(skribble, /this\.collapsedLossSessions\.add\(sessionId\)/);
assert.match(skribble, /if \(state\?\.status === 'lost'\) this\.scheduleLossAnimation\(state\.sessionId\)/);
assert.match(skribble, /this\.lostSessions\.delete\(sessionId\)/);
assert.match(skribble, /if \(state\.status === 'playing'\) content\.appendChild\(this\.keyboard\(state\)\);/);
assert.match(skribble, /row\.replaceWith\(this\.inputRow\(state\)\);\s*this\.fitBoardTiles\(\);/);
assert.match(skribble, /overflow-x:hidden/);
assert.match(skribble, /const SKRIBBLE_COIN_PARTICLE_SIZE = 28;/);

assert.match(slots, /for \(let index = 0; index < 30; index \+= 1\)/);
assert.match(slots, /this\.wait\(100, generation\)/);
assert.match(slots, /private async animateCollectedHearts/);
assert.match(slots, /classList\.add\('effect-active', 'effect-heart'\)/);
assert.ok(
  slots.indexOf("classList.add('effect-active', 'effect-heart')")
    < slots.indexOf('heartProgress: progress'),
  'Heart progress must only update after the reel Heart reaches its effect scale.'
);

console.log('v0.67.0 Firefox Auth, Skribble fit/loss and Slots presentation regressions passed.');
