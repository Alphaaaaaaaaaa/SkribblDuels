import * as assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GATEWAY_SLOT_ICON_IDS } from '@skribbl-duels/gateway-contracts';

const root = process.cwd();
const product = await readFile(resolve(root, 'apps/telemetry-inspector/src/duelProductUi.ts'), 'utf8');
const skribble = await readFile(resolve(root, 'apps/telemetry-inspector/src/skribbleUi.ts'), 'utf8');
const slots = await readFile(resolve(root, 'apps/telemetry-inspector/src/slotsUi.ts'), 'utf8');
const registry = JSON.parse(await readFile(resolve(root, 'res/progression-assets.template.json'), 'utf8')) as Record<string, string>;

assert.doesNotMatch(product, /\.scd-about-tutorial \.scd-icon:hover[^\n]*transform:none/);
assert.match(product, /\.scd-about-tutorial-logo:hover \{ transform:translateY\(-50%\) scale\(1\.1\); \}/);
assert.match(product, /identityColumn\.appendChild\(this\.skribbleUi\.createCoinPill\(true\)\)/);
assert.doesNotMatch(product, /actions\.appendChild\(this\.skribbleUi\.createCoinPill/);
assert.match(product, /this\.slotsUi\.closeForMatchFound\(\)/);

assert.match(skribble, /font-family:'Nunito',sans-serif/);
assert.match(skribble, /this\.accountConnected\(\)[\s\S]*this\.launcher\.style\.display/);
assert.match(skribble, /join\('\\n\\n'\)/);
assert.match(skribble, /Your result is ready to share\./);
assert.match(skribble, /pendingRevealKey/);
assert.match(skribble, /scd-skribble-row\.won/);
assert.match(skribble, /The word was '\$\{state\.answer\}'/);
assert.match(skribble, /window\.setTimeout\([\s\S]*5_000/);
assert.match(skribble, /state\.mode === 'practice'\) modeBar\.appendChild\(this\.returnToDailyButton\(\)\)/);
assert.match(skribble, /trySendPendingAction\(\)/);
assert.match(skribble, /Daily Skribble available!/);
assert.doesNotMatch(skribble, /Practice rounds and celebration replays/);
assert.doesNotMatch(skribble, /Replay Celebration|Replay celebration/);
assert.doesNotMatch(skribble, /opacity:\s*calc\(1\s*-/);

assert.match(slots, /for \(let index = 0; index < 7; index \+= 1\)/);
assert.match(slots, /this\.accountConnected\(\) && this\.homepageVisible\(\)/);
assert.match(slots, /Effects resolve in this order: Fill, Wizard, Eraser, Trash, Dice/);
assert.match(slots, /Skribbl Coins cannot be purchased, have no cash value/);
assert.match(slots, /effect-active[\s\S]*transform:scale\(1\.2\)/);
assert.match(slots, /window\.setTimeout\([\s\S]*5_000/);
assert.match(slots, /trySendPendingAction\(\)/);
assert.match(slots, /this\.options\.gateway\.spinSkribblSlots/);
assert.match(slots, /free && state\.nextFreeSpinSource/);

assert.equal(registry.skribbleReturn, 'res/skribble-icons/return.gif');
assert.equal(registry.slotsLogo, 'res/skribbl-slots/skribbl-slots-logo.gif');
for (const path of Object.values(registry)) {
  const data = await readFile(resolve(root, path));
  assert.match(data.subarray(0, 6).toString('ascii'), /^GIF8[79]a$/, `${path} must be an embedded GIF asset.`);
  assert.ok((await stat(resolve(root, path))).size > 0);
}
for (const icon of GATEWAY_SLOT_ICON_IDS) {
  const expected = icon === '7'
    ? 'slotSeven'
    : icon === 'skribbl-coin'
      ? 'slotCoin'
      : icon === 'skribbl-duels-logo'
        ? 'slotDuelsLogo'
        : `slot${icon[0]!.toUpperCase()}${icon.slice(1)}`;
  assert.ok(expected in registry, `Missing progression asset registration for ${icon}.`);
}

console.log('v0.66.0 Skribble stability, account gating, assets and Slots UI contract passed.');
