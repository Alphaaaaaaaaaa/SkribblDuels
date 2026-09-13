import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ateAndLeftNoCrumbsDefinition } from '@skribbl-duels/challenge-definitions';
import { GATEWAY_CLIENT_VERSION } from '@skribbl-duels/gateway-client';

const source = await readFile(resolve(
  process.cwd(),
  'apps/telemetry-inspector/src/duelProductUi.ts'
), 'utf8');
const userscriptSource = await readFile(resolve(
  process.cwd(),
  'apps/telemetry-inspector/src/userscript.ts'
), 'utf8');

assert.match(
  source,
  /#game-chat \.chat-content p \.scd-chat-wpm \{ color:var\(--COLOR_CHAT_TEXT_GUESSCHAT\) !important; \}/,
  'WPM suffixes must use Skribbl guess-chat text color.'
);
assert.doesNotMatch(
  source,
  /\.scd-chat-wpm\.scd-muted/,
  'The obsolete muted WPM selector must not survive.'
);

assert.match(source, /private duelChatFocusRequested = false;/);
assert.match(
  source,
  /if \(target\.dataset\.scdDuelChatInput === 'true'\) \{\s+event\.stopImmediatePropagation\(\);/,
  'Every private-chat keydown must be isolated before Skribbl can receive it.'
);
assert.match(source, /const restoreFocusedChatInput = this\.duelChatFocusRequested;/);

assert.match(source, /public registerOverflowOnly\(/);
assert.match(
  source,
  /target\.scrollWidth <= target\.clientWidth \+ 1/,
  'Overflow tooltips must use the rendered ellipsis width rather than always showing.'
);
assert.match(
  source,
  /this\.tooltips\.registerOverflowOnly\(statusLabel, this\.profileUiPreferences\.statusText\)/,
  'The status tooltip must contain only the complete status value.'
);

const inputAppendIndex = source.indexOf("label.append(\n        input,\n        element('span', 'scd-muted', `${DUEL_PROFILE_STATUS_MAX_LENGTH} characters maximum`)\n      );");
assert.notEqual(inputAppendIndex, -1, 'The status limit must render below the input in the same label.');
assert.doesNotMatch(source, /Status text · \$\{DUEL_PROFILE_STATUS_MAX_LENGTH\}/);
assert.match(source, /element\('button', 'scd-button danger', 'Cancel'\)/);
assert.match(source, /const trashPath = STAT_UTILITY_ICON_ASSET_PATHS\.trash;/);
assert.match(source, /this\.profileUiPreferences\.statusChallengeId = null;\s+this\.profileUiPreferences\.statusText = '';/);

assert.match(source, /const playerFound = state\.match !== null/);
assert.match(source, /if \(playerFound\) \{\s+this\.soundEffects\.play\('matchFound'\);\s+this\.closeProductModalsForMatchFound\(\);/);
assert.match(source, /private closeProductModalsForMatchFound\(\): void/);
for (const modal of ['profileColorPicker', 'profileDetailModal', 'duelProfileModal'] as const) {
  assert.match(source, new RegExp(`this\\.${modal}\\?\\.remove\\(\\);`));
}

assert.match(source, /\.scd-card\.scd-queue-waiting \{ display:grid;/);
assert.match(source, /background-image:url\('\/img\/load\.gif'\)/);
assert.match(source, /@keyframes scd-queue-load-rotate/);
assert.match(source, /loader\.setAttribute\('aria-label', 'Searching for a Duel player'\)/);

assert.match(source, /\.scd-profile-stat \{[^\n]*background:var\(--COLOR_PANEL_BG\)/);
assert.match(source, /'scd-button scd-profile-view-all scd-profile-coverage-card'/);
assert.match(source, /\.scd-profile-coverage-card\.selected \{ outline:0;background:#53e237; \}/);
assert.match(source, /dataset\.scdProfileDetailKey === reuseKey/);
assert.match(source, /existingBody\.scrollTop = scrollTop;/);
assert.match(source, /\}, 'all-local-statistics'\);/);

assert.match(source, /private applySavedProfilePresentation\(/);
assert.match(source, /this\.savedSelfNameColorIndex = colorIndex;/);
assert.match(source, /this\.duelChatMessages = this\.duelChatMessages\.map/);
assert.match(source, /appendColoredDuelName\(name, duelDisplayName, this\.duelNameColorIndex\('self'\)\)/);
assert.match(source, /author: ownMessage \? this\.duelDisplayName\('self'\) : message\.authorDisplayName/);

assert.equal(ateAndLeftNoCrumbsDefinition.version, 3);
assert.equal(ateAndLeftNoCrumbsDefinition.metadata.rankedEligible, true);
assert.equal(GATEWAY_CLIENT_VERSION, '0.62.0');
assert.match(userscriptSource, /const BUILD_VERSION = '0\.62\.0';/);

console.log('v0.62.0 UI polish, profile refresh, queue and Ranked eligibility tests passed.');
