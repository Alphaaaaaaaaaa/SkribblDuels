import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STARTER_CHALLENGE_IDS } from '@skribbl-duels/challenge-definitions';

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
assert.equal(registry.challenges.length, 47);
assert.equal(new Set(registry.challenges.map(entry => entry.challengeId)).size, 47);
assert.equal(new Set(registry.challenges.map(entry => entry.assetPath)).size, 47);
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

console.log('All 47 challenges have unique direct icon paths; absent artwork uses the UI fallback.');
