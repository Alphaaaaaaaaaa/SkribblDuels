import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DuelProductFoundation, ProductTooltipManager } from '../apps/telemetry-inspector/src/duelProductUi';
import { appendSocialMessage, SOCIAL_EMOJIS } from '../apps/telemetry-inspector/src/socialEmojis';
import { SocialFeatureUi } from '../apps/telemetry-inspector/src/socialUi';
import { clampTooltipAnchor } from '../apps/telemetry-inspector/src/tooltipPlacement';
import { normalizeProductUiSettings, createChallengeManifest, generateDraftBoard, type ChallengeCapability } from '@skribbl-duels/product-core';
import { starterChallengeDefinitions, CHALLENGE_DEFINITIONS_VERSION } from '@skribbl-duels/challenge-definitions';

const dom = new JSDOM('<!doctype html><html style="overflow:visible"><body style="overflow:visible"></body></html>', { url: 'https://skribbl.io', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'HTMLInputElement', 'HTMLButtonElement', 'KeyboardEvent', 'Event', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[key] });
}
const document = dom.window.document;
const product = Object.create(DuelProductFoundation.prototype) as any;
Object.assign(product, { panelBody: document.createElement('div'), duelChatMessages: [{ id: 'message', side: 'opponent', author: 'Friend', message: ':closed:', occurredAt: Date.now() }],
  gatewayState: { status: 'connected', match: { matchId: 'match', state: { phase: 'running', drawProposal: null } } },
  matchState: { matchId: 'match', outcome: null }, duelChatDraft: '', duelEmojiPickerOpen: false,
  duelChatStickToBottom: true, duelChatScrollTop: 0, restoreDuelChatFocus: false, tooltips: { register: () => {} },
  opponentRematchRequester: () => null, duelNameColorIndex: () => 26, showSimpleToast: () => {}, submitDuelChatMessage: (value: string) => { product.sent = value; } });
document.body.appendChild(product.panelBody);
const keydown = (event: KeyboardEvent) => product.handleDuelChatKeydown(event);
document.addEventListener('keydown', keydown, true);
try {
  assert.equal(SOCIAL_EMOJIS.find(item => item.path.endsWith('best-private-score.gif'))?.token, ':closed:');
  assert.equal(SOCIAL_EMOJIS.find(item => item.path.endsWith('best-public-score.gif'))?.token, ':open:');
  const legacy = document.createElement('div'); appendSocialMessage(legacy, ':stat/best-private-score: :stat/best-public-score:');
  assert.equal(legacy.querySelectorAll('img').length, 2, 'Existing stored messages keep their legacy aliases.');
  for (const image of legacy.querySelectorAll('img')) { assert.equal(image.alt, ''); assert.equal(image.hasAttribute('title'), false); }
  product.renderChatTab();
  const input = document.querySelector<HTMLInputElement>('[data-scd-duel-chat-input]')!;
  assert.equal(document.querySelector('.scd-match-chat-text')?.classList.contains('scd-social-emoji-only'), true);
  const toggle = document.querySelector<HTMLButtonElement>('.scd-duel-emoji-toggle')!;
  const picker = document.querySelector<HTMLElement>('.scd-social-emoji-picker')!;
  input.focus(); const press = (repeat = false) => {
    const event = new dom.window.KeyboardEvent('keydown', { key: 'e', ctrlKey: true, repeat, bubbles: true, cancelable: true });
    input.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  };
  press(); assert.equal(picker.hidden, false); press(true); assert.equal(picker.hidden, false); press(); assert.equal(picker.hidden, true);
  press();
  const closed = picker.querySelector<HTMLButtonElement>('[data-emoji-token=":closed:"]')!;
  closed.dispatchEvent(new dom.window.MouseEvent('click', { shiftKey: true, bubbles: true }));
  assert.equal(input.value, ':closed:'); assert.equal(picker.hidden, false); assert.equal(product.duelChatDraft, ':closed:');
  const open = picker.querySelector<HTMLButtonElement>('[data-emoji-token=":open:"]')!;
  open.click(); assert.equal(input.value, ':closed::open:'); assert.equal(picker.hidden, true);
  assert.equal(document.activeElement, input); assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('.scd-chat-characters')?.textContent, '14');
  assert.ok([...picker.querySelectorAll('img')].every(image => image.alt === ''));
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(product.sent, ':closed::open:');

  const social = Object.create(SocialFeatureUi.prototype) as any;
  assert.equal(social.activityLabel({ presence: 'online', lobby: { languageName: 'German', lobbyType: 'private', playerCount: 1, maxPlayers: 8 } }), 'German · Private · 1/8');
  assert.equal(normalizeProductUiSettings(null).telemetryPortMode, 'auto');
  assert.equal(normalizeProductUiSettings({ telemetryPortMode: 'own' }).telemetryPortMode, 'own');
  assert.equal(normalizeProductUiSettings({ telemetryPortMode: 'invalid' }).telemetryPortMode, 'auto');
  product.settings = normalizeProductUiSettings(null); product.options = { telemetryPorts: { getState: () => ({ mode: 'auto', nativeReady: true, typoReady: false, activeSource: null }) } };
  product.isHomepageVisible = () => true;
  assert.equal(product.isTypoDetected(), false); assert.equal(product.isMatchmakingAvailable(), true, 'An independent port permits homepage matchmaking without Typo.');
  assert.deepEqual(product.currentGatewayCapabilities(), ['skribbl-telemetry', 'official-word-list']);
  const manifest = createChallengeManifest({ definitionsVersion: CHALLENGE_DEFINITIONS_VERSION, definitions: starterChallengeDefinitions.map(definition => ({ id: definition.id, version: definition.version, metadata: definition.metadata, defaultParameters: definition.defaultParameters })) }, 'en');
  const capabilities = { available: new Set<ChallengeCapability>(product.currentGatewayCapabilities()) };
  for (const format of ['casual', 'ranked'] as const) {
    const result = generateDraftBoard(manifest, { format, seed: 72, capabilities });
    assert.ok(result.board, `${format} must have a usable native-only pool.`);
    for (const field of result.board.fields) assert.ok(!manifest.entries.find(entry => entry.id === field.challengeId)?.capabilities.some(capability => capability.startsWith('typo')));
  }
  product.isHomepageVisible = () => false; assert.equal(product.isMatchmakingAvailable(), false, 'Native capture preserves the active-lobby action lock.');

  for (const direction of ['N', 'S', 'E', 'W'] as const) {
    for (const [x, y] of [[12, 12], [12, 750], [1012, 12], [1012, 750]]) {
      const placement = clampTooltipAnchor(x!, y!, 300, 64, direction, 1024, 768);
      const left = placement.x + (direction === 'N' || direction === 'S' ? -150 : direction === 'W' ? -300 : 0);
      const top = placement.y + (direction === 'N' ? -64 : direction === 'E' || direction === 'W' ? -32 : 0);
      assert.ok(left >= 8 && left + 300 <= 1016); assert.ok(top >= 8 && top + 64 <= 760);
    }
  }
  const manager = new ProductTooltipManager('tooltip-test'); manager.start();
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('scd-tooltip') ? 300 : 38; } });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('scd-tooltip') ? 64 : 38; } });
  for (const top of [12, 710]) {
    const avatar = document.createElement('button'); document.body.appendChild(avatar);
    avatar.getBoundingClientRect = () => ({ left: 12, right: 50, top, bottom: top + 38, width: 38, height: 38, x: 12, y: top, toJSON() {} });
    manager.register(avatar, 'Open a friend profile with a long name', 'Y'); avatar.dispatchEvent(new dom.window.Event('pointerover', { bubbles: true }));
    const tooltip = document.querySelector<HTMLElement>('.scd-tooltip')!;
    assert.equal(tooltip.parentElement, document.body);
    assert.ok(parseFloat(tooltip.style.left) - 150 >= 8, 'Top/bottom-left friend tooltips fit inside the viewport.');
    avatar.remove();
  }
  manager.stop();
  const css = readFileSync('apps/telemetry-inspector/src/socialUi.ts', 'utf8');
  assert.match(css, /\.scd-home-friend \.scd-social-avatar-wrap\{transition:transform/);
  assert.match(css, /transform:scale\(1\.12\)/);
  console.log('v0.72.0: shared Match emoji picker, Ctrl+E/Shift, no emoji alt text, old aliases, lobby separators, native capability drafts, homepage locks and viewport-clamped tooltips passed.');
} finally { document.removeEventListener('keydown', keydown, true); dom.window.close(); }
