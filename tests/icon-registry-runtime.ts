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
assert.equal(registry.registryVersion, 1);
assert.deepEqual(Object.keys(registry.ui).sort(), ['about', 'logo', 'settings']);
assert.deepEqual(Object.keys(registry.countdown), ['1', '2', '3', '4', '5', 'G', 'O', '!']);
assert.equal(registry.challenges.length, 46);
assert.equal(new Set(registry.challenges.map(entry => entry.challengeId)).size, 46);
assert.equal(new Set(registry.challenges.map(entry => entry.assetPath)).size, 46);
assert.deepEqual(
  [...registry.challenges.map(entry => entry.challengeId)].sort(),
  [...STARTER_CHALLENGE_IDS].sort()
);
for (const entry of registry.challenges) {
  assert.match(entry.assetPath, /^challenge-icons\/[a-z0-9-]+\.gif$/);
}

console.log('All 46 challenge IDs and UI/countdown GIF paths are covered by the icon registry.');
