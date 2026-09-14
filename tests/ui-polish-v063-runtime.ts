import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isTypoRuntimeDetected } from '../apps/telemetry-inspector/src/typoRuntimeDetection';

const root = process.cwd();
const source = await readFile(resolve(root, 'apps/telemetry-inspector/src/duelProductUi.ts'), 'utf8');
const registry = JSON.parse(await readFile(resolve(
  root,
  'res/challenge-icons/registry.template.json'
), 'utf8')) as { ui: Record<string, string>; challenges: Array<{ challengeId: string; assetPath: string }> };

assert.match(
  source,
  /\.scd-queue-loader \{[^\n]*background-size:contain;animation:/,
  'The queue spinner must not add a drop shadow.'
);
assert.match(source, /\.scd-auth-avatar \{[^\n]*background:transparent;/);
assert.match(
  source,
  /\.scd-button\.danger\.scd-profile-status-reset[^\n]*\{ background:transparent; \}/,
  'The status reset icon must remain transparent in every interaction state.'
);
assert.match(source, /const characterCount = element\(\s*'span',\s*'scd-chat-characters'/);
assert.match(source, /characterCount\.textContent = String\(length\)/);
assert.match(source, /characterCount\.classList\.toggle\('visible', length > 0\)/);

assert.match(source, /\[data-scd-runtime-id\]::-webkit-scrollbar[^\n]*width:14px/);
assert.match(source, /background-color:var\(--COLOR_PANEL_LO\) !important/);
assert.match(source, /background-color:var\(--COLOR_PANEL_HI\) !important/);
assert.doesNotMatch(source, /::-webkit-scrollbar-thumb[^\n]*brightness\(/);
assert.match(source, /if \(eventName === 'wheel'\) continue;/);
assert.match(source, /if \(!consumes\) event\.preventDefault\(\)/);
assert.match(source, /data-scd-scroll-lock-runtime/);

assert.match(source, /\.scd-profile-choice \{[^\n]*background:var\(--SCD_ACCENT\)/);
assert.match(source, /\.scd-profile-choice\.selected \{ outline:0;background:#53e237; \}/);
assert.doesNotMatch(
  source,
  /The current Gateway test can supply a simulated queued opponent/,
  'The obsolete simulated-opponent copy must not return.'
);

assert.equal(isTypoRuntimeDetected({ typo_loader: 'true' }), true);
assert.equal(isTypoRuntimeDetected({ typo_loaded: 'true' }), true);
assert.equal(isTypoRuntimeDetected({}, 'true'), true);
assert.equal(isTypoRuntimeDetected({ typo_loader: 'false', typo_loaded: 'false' }), false);
assert.equal(isTypoRuntimeDetected({ typoLoader: 'true' }), true, 'Dashed marker compatibility remains supported.');
assert.match(source, /body\?\.getAttribute\('typo-skribbl-loaded'\)/);
assert.match(source, /private startTypoDetectionPolling\(\): void/);
assert.match(source, /window\.setInterval\(\(\) => this\.reconcileTypoDetection\(\), 500\)/);
assert.match(source, /document\.addEventListener\('skribblInitialized'/);
assert.match(source, /private isMatchmakingAvailable\(\): boolean/);
assert.match(source, /acceptInvite: token => \{\s+if \(!this\.isMatchmakingAvailable\(\)\)/);
assert.doesNotMatch(source, /Matchmaking is available only while the Typo loader is active/);
assert.match(source, /Enable Typo to use Matchmaking/);
assert.match(source, /Matchmaking is only possible on the Skribbl homepage, not inside an active lobby/);
assert.match(source, /classList\.toggle\('scd-unavailable-action'/);

assert.match(source, /Authentication v\$\{AUTH_CLIENT_VERSION\} · Gateway Contract v\$\{GATEWAY_CONTRACT_VERSION\}/);
assert.doesNotMatch(source, /element\('strong', '', 'Duel formats'\)/);
assert.doesNotMatch(source, /The Gateway owns matchmaking, draft, countdown, claims/);
assert.match(source, /const ABOUT_TUTORIAL_PAGES = \[/);
assert.match(source, /\.scd-about-tutorial \{[^\n]*max-height:450px/);
assert.match(source, /tutorial\.addEventListener\('wheel'/);
assert.match(source, /pauseAutoAdvanceAfterWheel\(\)/);
assert.match(source, /}, 10_000\);/);
assert.match(source, /}, 3_500\);/);
assert.match(source, /Casual uses a 3×3 challenge board\. Be the first player to claim five challenges\./);
assert.match(source, /Ranked uses a 5×5 challenge board\. Be the first player to claim thirteen challenges\./);
assert.match(source, /Take turns choosing one of two challenges\. The last challenge is chosen at random\./);
assert.match(source, /Play skribbl\.io and complete challenges as quickly as possible\./);
assert.match(source, /Complete the target amount of challenges and win the match!/);
assert.match(source, /Discord: analphabetism#0/);
for (let index = 1; index <= 5; index += 1) {
  assert.equal(registry.ui[`tutorialStep${index}`], `res/about-icons/step${index}.gif`);
  await access(resolve(root, `res/about-icons/step${index}.gif`));
}
assert.equal(registry.ui.contact, 'res/about-icons/contact.gif');
await access(resolve(root, registry.ui.contact));
assert.equal(
  registry.challenges.find(entry => entry.challengeId === 'drop-streak')?.assetPath,
  'res/challenge-icons/drop-streak.gif'
);
await access(resolve(root, 'res/challenge-icons/drop-streak.gif'));

for (const directory of ['challenge-icons', 'sound-effects', 'stat-icons']) {
  assert.equal(existsSync(resolve(root, directory)), false, `${directory} must be consolidated under res/.`);
  await access(resolve(root, 'res', directory));
}

console.log('v0.63.0 UI, Typo gate, tutorial, assets and metric regressions passed.');
