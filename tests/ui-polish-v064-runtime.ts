import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GATEWAY_CLIENT_VERSION } from '@skribbl-duels/gateway-client';
import { isTypoRuntimeDetected } from '../apps/telemetry-inspector/src/typoRuntimeDetection';

const root = process.cwd();
const source = await readFile(resolve(root, 'apps/telemetry-inspector/src/duelProductUi.ts'), 'utf8');
const userscriptSource = await readFile(resolve(root, 'apps/telemetry-inspector/src/userscript.ts'), 'utf8');

assert.equal(isTypoRuntimeDetected({ typo_loader: 'true' }), true);
assert.equal(isTypoRuntimeDetected({ typo_loaded: 'true' }), true);
assert.equal(isTypoRuntimeDetected({}, 'true'), true);
assert.equal(isTypoRuntimeDetected({}, null), false);
assert.match(source, /window\.setInterval\(\(\) => this\.reconcileTypoDetection\(\), 500\)/);
assert.match(source, /document\.addEventListener\('skribblInitialized'/);
assert.match(source, /body\?\.getAttribute\('typo-skribbl-loaded'\)/);
assert.match(source, /pauseAutoAdvanceAfterWheel\(\)/);
assert.match(source, /}, 10_000\);/);
assert.match(source, /\.scd-about-tutorial \{[^\n]*max-height:450px/);
assert.doesNotMatch(source, /element\('strong', '', 'Duel formats'\)/);
assert.doesNotMatch(source, /The Gateway owns matchmaking, draft, countdown, claims/);
assert.match(source, /Enable Typo to use Matchmaking/);
assert.match(source, /Matchmaking is only possible on the Skribbl homepage, not inside an active lobby/);
assert.equal(GATEWAY_CLIENT_VERSION, '0.65.0');
assert.match(userscriptSource, /const BUILD_VERSION = '0\.65\.0';/);
assert.match(source, /version: '0\.65\.0'/);

console.log('v0.64.0 Typo/tutorial regressions remain intact in v0.65.0.');
