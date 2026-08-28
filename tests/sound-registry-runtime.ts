import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { SoundEffectId } from '../apps/telemetry-inspector/src/generatedSoundAssets';
import { SoundEffectPlayer } from '../apps/telemetry-inspector/src/soundEffects';

const registry = JSON.parse(await readFile(resolve(
  process.cwd(),
  'sound-effects/registry.template.json'
), 'utf8')) as { sounds: Record<string, string> };
assert.deepEqual(new Set(Object.values(registry.sounds).map(path => extname(path))), new Set(['.ogg']));
assert.equal(registry.sounds.countdownTick, 'sound-effects/countdown.ogg');

let plays = 0;
let observedVolume = -1;
const player = new SoundEffectPlayer({ matchChatPing: 'data:audio/ogg;base64,AA==' }, () => ({
  volume: 0,
  currentTime: 0,
  play() {
    plays += 1;
    observedVolume = this.volume;
  }
}));
player.setVolume(35);
assert.ok(player.play('matchChatPing'));
assert.equal(plays, 1);
assert.equal(observedVolume, 0.35);
assert.equal(player.play('queueJoin' as SoundEffectId), false, 'Missing files must be silent no-ops.');
player.setVolume(0);
assert.equal(player.play('matchChatPing'), false, 'Muted playback must not create audio.');

console.log('Sound registry and fail-safe playback test passed.');
