import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STARTER_CHALLENGE_IDS } from '@skribbl-duels/challenge-definitions';
import { EMBEDDED_ICON_ASSETS } from '../apps/telemetry-inspector/src/generatedIconAssets';

interface IconRegistry {
  registryVersion: number;
  ui: Record<string, string>;
  countdown: Record<string, string>;
  challenges: Array<{
    challengeId: string;
    assetPath: string;
    currentMetadataIcon: string | null;
  }>;
}

const registry = JSON.parse(
  await readFile(new URL('../challenge-icons/registry.template.json', import.meta.url), 'utf8')
) as IconRegistry;
assert.equal(registry.registryVersion, 2);
assert.deepEqual(Object.keys(registry.ui).sort(), ['about', 'logo', 'notReady', 'ready', 'settings']);
assert.equal(registry.ui.ready, 'challenge-icons/checkmark.gif');
assert.equal(registry.ui.notReady, 'challenge-icons/crossmark.gif');
assert.deepEqual(Object.keys(registry.countdown), ['1', '2', '3', '4', '5', 'G', 'O', '!']);
assert.equal(registry.challenges.length, 53);
assert.equal(new Set(registry.challenges.map(entry => entry.challengeId)).size, 53);
assert.equal(new Set(registry.challenges.map(entry => entry.assetPath)).size, 53);
assert.deepEqual(
  [...registry.challenges.map(entry => entry.challengeId)].sort(),
  [...STARTER_CHALLENGE_IDS].sort()
);
for (const entry of registry.challenges) {
  assert.match(entry.assetPath, /^challenge-icons\/[a-z0-9-]+\.(?:gif|png)$/);
  assert.match(
    entry.assetPath,
    new RegExp(`^challenge-icons/${entry.challengeId}\\.(?:gif|png)$`),
    `Challenge ${entry.challengeId} must keep its own future-proof icon path.`
  );
}
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'transcended')?.assetPath,
  'challenge-icons/transcended.gif'
);
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'ate-and-left-no-crumbs')?.assetPath,
  'challenge-icons/ate-and-left-no-crumbs.gif'
);
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'guessingoat')?.assetPath,
  'challenge-icons/guessingoat.gif'
);
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'drop-streak')?.assetPath,
  'challenge-icons/drop-streak.gif'
);
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'internet-explorer')?.assetPath,
  'challenge-icons/internet-explorer.gif'
);
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'wpmaster')?.assetPath,
  'challenge-icons/wpmaster.gif'
);
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'type-racer')?.assetPath,
  'challenge-icons/type-racer.gif'
);
for (const suppliedPath of [
  'challenge-icons/transcended.gif',
  'challenge-icons/ate-and-left-no-crumbs.gif',
  'challenge-icons/guessingoat.gif'
]) {
  assert.match(
    EMBEDDED_ICON_ASSETS[suppliedPath] ?? '',
    /^data:image\/gif;base64,[A-Za-z0-9+/=]+$/,
    `${suppliedPath} must be embedded into the release userscript.`
  );
}
for (const fallbackPath of [
  'challenge-icons/drop-streak.gif',
  'challenge-icons/internet-explorer.gif',
  'challenge-icons/wpmaster.gif',
  'challenge-icons/type-racer.gif'
]) {
  assert.equal(
    EMBEDDED_ICON_ASSETS[fallbackPath],
    undefined,
    `${fallbackPath} keeps its unique fallback path until artwork is supplied.`
  );
}

console.log('All 53 challenges have unique direct icon paths; absent artwork uses the UI fallback.');
