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
assert.equal(registry.sounds.queueJoin, 'sound-effects/join-queue.ogg');
assert.equal(registry.sounds.queueLeave, 'sound-effects/leave-queue.ogg');
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

let paused = false;
const unlockable = new SoundEffectPlayer({ queueJoin: 'data:audio/ogg;base64,AA==' }, () => ({
  volume: 1,
  currentTime: 0,
  play: () => Promise.resolve(),
  pause: () => { paused = true; }
}));
assert.equal(await unlockable.unlock(), true, 'Trusted-gesture prewarming should resolve.');
assert.equal(paused, true);
assert.equal(unlockable.getDiagnostics().unlocked, true);
assert.equal(unlockable.getDiagnostics().embeddedSounds, 1);

const autoplayBlocked = new SoundEffectPlayer({ queueJoin: 'data:audio/ogg;base64,AA==' }, () => ({
  volume: 1,
  currentTime: 0,
  play: () => Promise.reject(new DOMException('play() failed because the user did not interact', 'NotAllowedError'))
}));
assert.equal(autoplayBlocked.play('queueJoin'), true, 'A scheduled play attempt should be distinguishable from its async rejection.');
await new Promise(resolvePromise => setTimeout(resolvePromise, 0));
assert.equal(autoplayBlocked.getDiagnostics().playbackRejections, 1);
assert.match(autoplayBlocked.getDiagnostics().lastError ?? '', /NotAllowedError/);

const viteConfig = await readFile(resolve(process.cwd(), 'apps/telemetry-inspector/vite.config.ts'), 'utf8');
assert.match(viteConfig, /grant:\s*'none'/, 'Embedded data-audio does not require a Tampermonkey resource grant.');

console.log('Sound registry, autoplay diagnostics and fail-safe playback test passed.');
