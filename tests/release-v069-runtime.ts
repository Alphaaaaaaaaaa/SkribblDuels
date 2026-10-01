import * as assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const [rootPackageRaw, inspectorPackageRaw, gatewayPackageRaw, contractsPackageRaw, clientPackageRaw,
  userscript, product, socialUi, persistence, contracts, generatedAssets, templateRaw] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('apps/telemetry-inspector/package.json', 'utf8'),
  readFile('apps/gateway/package.json', 'utf8'),
  readFile('packages/gateway-contracts/package.json', 'utf8'),
  readFile('packages/gateway-client/package.json', 'utf8'),
  readFile('apps/telemetry-inspector/src/userscript.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/duelProductUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/socialUi.ts', 'utf8'),
  readFile('apps/gateway/src/socialPersistence.ts', 'utf8'),
  readFile('packages/gateway-contracts/src/types.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/generatedProgressionAssets.ts', 'utf8'),
  readFile('res/progression-assets.template.json', 'utf8')
]);

assert.equal(JSON.parse(rootPackageRaw).version, '0.69.1');
assert.equal(JSON.parse(inspectorPackageRaw).version, '0.69.1');
assert.equal(JSON.parse(gatewayPackageRaw).version, '0.11.1');
assert.equal(JSON.parse(contractsPackageRaw).version, '0.9.1');
assert.equal(JSON.parse(clientPackageRaw).version, '0.10.1');
assert.match(userscript, /BUILD_VERSION = '0\.69\.1'/);
assert.match(product, /version: '0\.69\.1'/);
assert.match(product, /new SocialFeatureUi/);
assert.match(product, /this\.socialUi\.handleGatewayUpdate\(previous, state\)/);
assert.match(product, /this\.socialUi\.decorateProfileAvatar\(profileAvatar\)/);
assert.match(product, /this\.socialUi\.createProfileControls\(\)/);
assert.match(product, /this\.socialUi\.renderSettings\(stack\)/);
assert.match(product, /this\.socialUi\.closeModals\(\)/);
assert.match(product, /this\.socialUi\.isMatchInviteAcceptancePending\(\)/);
assert.match(product, /mainStatIds: ProfileStatId\[\]/);
assert.match(product, /this\.profileUiPreferences\.mainStatIds\.forEach/);
assert.doesNotMatch(product, /\.scd-avatar-discord \{ background:rgba\(255,255,255/);

for (const required of [
  'friend-request-received',
  'friend-message-received',
  'match-invite-received',
  "document.dispatchEvent(new CustomEvent('joinLobby'",
  'showHomepageList',
  'homepageAnchor',
  'registerOverflowTooltip',
  'friendPing',
  'friendLocked'
]) assert.ok(socialUi.includes(required), `Social UI is missing ${required}.`);

assert.match(contracts, /GATEWAY_CONTRACT_VERSION = 16/);
assert.match(contracts, /type: 'SOCIAL_SNAPSHOT'/);
assert.match(contracts, /type: 'FRIEND_SEARCH_RESULT'/);

assert.match(socialUi, /availability === 'offline' \? 'offline' : activeDuel \? 'duel'/);
assert.match(socialUi, /Messages are stored only in this browser and are delivered only while both friends are online/);
assert.match(socialUi, /\.scd-home-friends-list\{max-height:290px;overflow:auto\}/);
assert.match(socialUi, /\.scd-home-friend:nth-child\(odd\)/);
assert.match(socialUi, /\.scd-social-status-icon\[aria-label='Online'\]\{width:26px;height:20px/);
assert.match(persistence, /replace\(\/#0\$\/i, ''\)/);
assert.ok(
  persistence.includes("normalized.replace(/[\\\\%_]/g, '\\\\$&')"),
  'Exact Discord username search must escape ILIKE wildcards such as underscores.'
);

const template = JSON.parse(templateRaw) as Record<string, string>;
const friendAssets = Object.entries(template).filter(([key]) => key.startsWith('friend'));
assert.equal(friendAssets.length, 18);
for (const [id, path] of friendAssets) {
  await access(path);
  assert.match(generatedAssets, new RegExp(`"${id}": "data:image\\/gif;base64,`));
}

console.log('v0.69.0 Friends, Social privacy, homepage presence and profile-stat regressions remain intact in v0.69.1.');
