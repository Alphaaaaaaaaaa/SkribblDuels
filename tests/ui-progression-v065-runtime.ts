import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DEFAULT_PRODUCT_UI_SETTINGS,
  normalizeProductUiSettings
} from '@skribbl-duels/product-core';
import type { GatewaySkribbleState } from '@skribbl-duels/gateway-contracts';
import { SKRIBBLE_SHARE_TEXT_FOR_TESTING } from '../apps/telemetry-inspector/src/skribbleUi';

const root = process.cwd();
const productSource = await readFile(resolve(root, 'apps/telemetry-inspector/src/duelProductUi.ts'), 'utf8');
const skribbleSource = await readFile(resolve(root, 'apps/telemetry-inspector/src/skribbleUi.ts'), 'utf8');
const soundSource = await readFile(resolve(root, 'apps/telemetry-inspector/src/soundEffects.ts'), 'utf8');
const telemetrySource = await readFile(resolve(root, 'packages/telemetry-core/src/chat/textInputTelemetryAdapter.ts'), 'utf8');
const challengeSource = await readFile(resolve(root, 'packages/challenge-definitions/src/definitions/certifiedWpm.ts'), 'utf8');
const envExample = await readFile(resolve(root, 'apps/gateway/.env.example'), 'utf8');
const coin = await readFile(resolve(root, 'res/skribbl-coin.gif'));

assert.equal(DEFAULT_PRODUCT_UI_SETTINGS.launcher.visibility, 'always');
assert.equal(normalizeProductUiSettings({ launcher: { visibility: 'active-match' } }).launcher.visibility, 'active-match');
assert.equal(normalizeProductUiSettings({ launcher: { visibility: 'sometimes' } }).launcher.visibility, 'always');
assert.match(productSource, /Only show during an active match/);
assert.match(productSource, /visibility === 'active-match' && !activeMatch/);

assert.match(productSource, /\.scd-about-tutorial \.scd-icon:hover[^\n]*transform:none/);
assert.match(productSource, /\.scd-about-page-visual:hover \{ transform:none; \}/);

assert.match(productSource, /previousHomepageAuthority !== 'lobby'[\s\S]*this\.cancelMatchmaking\(\)/);
assert.match(productSource, /const readyMatch = this\.gatewayState\.match\?\.state\.phase === 'ready-check'[\s\S]*this\.beginLobbyMatchReadyCountdown\(readyMatch\.matchId\)/);
assert.match(productSource, /You joined a Skribbl lobby, so Homepage matchmaking was cancelled\./);
assert.match(productSource, /this\.lobbyMatchReadyDeadline = Date\.now\(\) \+ 10_000/);
assert.match(productSource, /Leave your current lobby to start the match\./);
assert.match(productSource, /remaining > 0 && remaining <= 5\) this\.soundEffects\.play\('countdownTick'\)/);
assert.match(productSource, /stagePhase && !this\.lobbyMatchReadyMatchId/);
assert.match(productSource, /this\.cancelReadyCheck\(matchId\)/);
assert.match(productSource, /\.scd-lobby-ready-clock[^\n]*background-image:url\('\/img\/clock\.gif'\)/);

assert.match(soundSource, /public initialize\(\): void/);
assert.match(soundSource, /audio\.preload = 'auto'/);
assert.match(soundSource, /audio\.load\?\.\(\)/);
assert.match(productSource, /this\.soundEffects\.initialize\(\)/);

assert.match(telemetrySource, /shouldResetTextInputAttemptBeforeInput/);
assert.match(telemetrySource, /selectionStart === 0[\s\S]*selectionEnd === value\.length/);
assert.match(telemetrySource, /typedCharacterCount/);
assert.match(challengeSource, /payload\.typedCharacterCount >= payload\.characterCount/);

assert.equal(coin.subarray(0, 6).toString('ascii'), 'GIF89a');
assert.equal(coin.readUInt16LE(6), 40);
assert.equal(coin.readUInt16LE(8), 40);
assert.match(skribbleSource, /top:25vh/);
assert.match(skribbleSource, /Word not found inside provided \$\{result\.state\.languageName\} wordlist\./);
assert.match(skribbleSource, /filter:brightness\(75%\) contrast\(200%\) saturate\(300%\) hue-rotate\(310deg\)/);
assert.match(skribbleSource, /--scd-board-tile-size/);
assert.match(skribbleSource, /Math\.max\(2, codePoints\(this\.draft\)\.length \+ 1\)/);
assert.match(skribbleSource, /Practice rounds never award Skribbl Coins\./);
assert.match(skribbleSource, /Replay celebration · 1 Coin/);
assert.match(skribbleSource, /The Gateway checks every guess without sending the answer to the browser in advance\./);
assert.match(skribbleSource, /Next official Skribble in/);
assert.match(envExample, /^SKRIBBLE_DAILY_SECRET=$/m);

const shareState: GatewaySkribbleState = {
  sessionId: 'session-1',
  mode: 'daily',
  dateKey: '2026-09-16',
  nextDailyAt: Date.UTC(2026, 8, 17),
  languageId: 0,
  languageName: 'English',
  availability: 'ready',
  unavailableReason: null,
  status: 'solved',
  maxAttempts: 10,
  minimumLength: 2,
  maximumLength: 32,
  attempts: [{
    guess: 'apple',
    marks: ['correct', 'semicorrect', 'incorrect', 'correct', 'correct'],
    submittedAt: Date.UTC(2026, 8, 16, 12)
  }],
  canEarn: false,
  rewarded: true,
  rewardAmount: 12
};
assert.equal(
  SKRIBBLE_SHARE_TEXT_FOR_TESTING(shareState),
  'Skribble\nLanguage: English\n\nSolved in 1 of 10 tries.\n\n🟩🟨⬛🟩🟩'
);

console.log('v0.65.0 queue hand-off, launcher, WPM input, sound and Skribble UI regressions passed.');
