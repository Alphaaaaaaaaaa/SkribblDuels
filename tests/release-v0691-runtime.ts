import * as assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const [rootRaw, inspectorRaw, gatewayRaw, clientRaw, contractsRaw, userscript, product,
  socialUi, gatewayClient, persistence, service, assetTemplateRaw, generatedAssets] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('apps/telemetry-inspector/package.json', 'utf8'),
  readFile('apps/gateway/package.json', 'utf8'),
  readFile('packages/gateway-client/package.json', 'utf8'),
  readFile('packages/gateway-contracts/package.json', 'utf8'),
  readFile('apps/telemetry-inspector/src/userscript.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/duelProductUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/socialUi.ts', 'utf8'),
  readFile('packages/gateway-client/src/socketIoGatewayClient.ts', 'utf8'),
  readFile('apps/gateway/src/socialPersistence.ts', 'utf8'),
  readFile('apps/gateway/src/socialService.ts', 'utf8'),
  readFile('res/progression-assets.template.json', 'utf8'),
  readFile('apps/telemetry-inspector/src/generatedProgressionAssets.ts', 'utf8')
]);

assert.equal(JSON.parse(rootRaw).version, '0.71.0');
assert.equal(JSON.parse(inspectorRaw).version, '0.71.0');
assert.equal(JSON.parse(gatewayRaw).version, '0.13.0');
assert.equal(JSON.parse(clientRaw).version, '0.12.0');
assert.equal(JSON.parse(contractsRaw).version, '0.11.0');
assert.match(userscript, /BUILD_VERSION = '0\.71\.0'/);
assert.match(product, /version: '0\.71\.0'/);

assert.match(product, /const sidebar = element\('div', 'scd-profile-sidebar'\)/);
assert.match(product, /sidebar\.append\(identityColumn, this\.socialUi\.createProfileControls\(\)\)/);
assert.match(product, /\.scd-icon-button:hover:not\(:disabled\),\.scd-icon-button:active:not\(:disabled\) \{ background:transparent; \}/);
assert.match(product, /\.scd-profile-sidebar \{ min-width:0;display:flex;flex-direction:column;gap:12px; \}/);

assert.doesNotMatch(socialUi.slice(socialUi.indexOf('public openFriends('), socialUi.indexOf('public renderSettings(')), /friendSlimy/, 'The friends header stays free of decorative slime icons.');
assert.match(socialUi, /grid-template-columns:minmax\(0,1fr\) 44px/);
assert.doesNotMatch(socialUi, /\.scd-social-row:nth-child/);
assert.match(socialUi, /const friendSearchChanged = JSON\.stringify\(previous\.friendSearch\)/);
assert.match(socialUi, /friendSearchChanged && this\.modal\?\.isConnected/);
assert.match(socialUi, /createSearchSkeleton\(\)/);
assert.match(socialUi, /background:url\('\/img\/load\.gif'\) center\/contain no-repeat/);
assert.match(socialUi, /scd-social-skeleton-line username/);
assert.match(socialUi, /this\.optimisticAvailability = value;[\s\S]*this\.refreshProfileControls\(\);[\s\S]*setSocialPreferences/);
assert.match(socialUi, /friendUnblock/);
assert.match(socialUi, /this\.options\.gateway\.unblockFriend\(profile\.accountId\)/);
assert.match(socialUi, /selected:hover:not\(:disabled\)[^\n]*background:#38c41c/);
assert.doesNotMatch(socialUi, /background:rgba\(255,255,255,\.1\)/);

assert.match(gatewayClient, /socialError: structuredClone\(value\)/);
assert.match(gatewayClient, /\[Skribbl Duels Social\] Action failed/);
assert.match(gatewayClient, /value\.requestId\.startsWith\('social-'\)/);
assert.match(persistence, /this\.client\.rpc\('gateway_social_contract_version'\)/);
assert.match(persistence, /Number\(contract\.data\) !== 18/);
assert.match(persistence, /unblockAccount\(accountId: string, blockedId: string\)/);
assert.match(service, /Diagnostic ID: \$\{diagnosticId\}/);
assert.match(service, /requestId: commandRequestId\(message\)/);
assert.match(service, /canUnblock = relationship === 'blocked' && viewerCanUnblock/);

const template = JSON.parse(assetTemplateRaw) as Record<string, string>;
assert.equal(template.friendUnblock, 'res/friend-system/unblock.gif');
await access(template.friendUnblock);
assert.match(generatedAssets, /"friendUnblock": "data:image\/gif;base64,/);

console.log('v0.71.0 Social RPC, diagnostics, search, unblock and UI polish regressions passed.');
