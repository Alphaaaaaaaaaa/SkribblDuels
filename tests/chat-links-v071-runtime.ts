import * as assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { appendChatText, ChatLinkifier } from '../apps/telemetry-inspector/src/chatLinks';
import { appendSocialMessage, isEmojiOnlyMessage, SOCIAL_EMOJIS, SOCIAL_EMOJI_GROUPS } from '../apps/telemetry-inspector/src/socialEmojis';
import { readFile, readdir } from 'node:fs/promises';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="game-chat"><div class="chat-content"></div></div></body></html>', { url: 'https://skribbl.io' });
for (const key of ['window', 'document', 'MutationObserver', 'HTMLElement']) Object.defineProperty(globalThis, key, {
  configurable: true, value: key === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[key]
});
const document = dom.window.document;
const linkifier = new ChatLinkifier();
try {
  assert.equal(SOCIAL_EMOJIS.length, 132);
  assert.deepEqual(SOCIAL_EMOJI_GROUPS, ['Emotions', 'Skribbl Tools', 'Collectibles', 'Skribbl Hats', 'Food', 'Other', 'Objects', 'Symbols', 'Hotkeys']);
  assert.equal(SOCIAL_EMOJIS[0]!.token, ':like:'); assert.equal(SOCIAL_EMOJIS.at(-1)!.token, ':exclamationmark:');
  const removed = ['stat/best-typing-wpm', 'stat/duel-wins', 'challenge/bullet-skribbl-io', 'challenge/drop-down', 'challenge/fanboy', 'stat/typing-trend'];
  assert.ok(SOCIAL_EMOJIS.every(item => !removed.some(token => item.aliases.some(alias => alias === `:${token}:`))));
  const additions = SOCIAL_EMOJIS.filter(item => item.path.includes('/additional-emojis/'));
  assert.deepEqual(additions.map(item => item.path.split('/').at(-1)).sort(), (await readdir('res/friend-system/additional-emojis')).sort());
  for (const item of SOCIAL_EMOJIS) {
    const bytes = await readFile(item.path);
    assert.deepEqual(Buffer.from(item.source.split(',')[1]!, 'base64'), bytes, `${item.token} embeds the correct GitHub asset.`);
    const target = document.createElement('span'); appendSocialMessage(target, item.token);
    assert.equal(target.querySelector('img')?.getAttribute('src'), item.source);
    for (const alias of item.aliases) {
      const old = document.createElement('span'); appendSocialMessage(old, alias);
      assert.equal(old.querySelector('img')?.getAttribute('src'), item.source, 'Old chat tokens remain readable.');
    }
  }
  for (const token of removed) { const target = document.createElement('span'); appendSocialMessage(target, `:${token}:`); assert.equal(target.querySelectorAll('img').length, 1); }
  assert.equal(isEmojiOnlyMessage(':heart:'), true); assert.equal(isEmojiOnlyMessage(' :heart: :pizza: '), true);
  assert.equal(isEmojiOnlyMessage('Hello :heart:'), false); assert.equal(isEmojiOnlyMessage(':unknown:'), false);

  const body = 'Visit https://example.com/a_(b), then www.example.org. <img onerror="bad()"> javascript:alert(1) data:text/html,evil';
  const target = document.createElement('span'); appendChatText(target, body);
  assert.equal(target.textContent, body, 'Linkification preserves the exact telemetry-visible text.');
  const links = [...target.querySelectorAll('a')]; assert.equal(links.length, 2);
  assert.equal(links[0]!.href, 'https://example.com/a_(b)'); assert.equal(links[1]!.href, 'https://www.example.org/');
  assert.ok(links.every(link => link.target === '_blank' && link.rel === 'noopener noreferrer'));
  assert.equal(target.querySelector('img'), null);
  let pageClick = 0; document.body.appendChild(target); document.body.addEventListener('click', () => pageClick++);
  links[0]!.addEventListener('click', event => event.preventDefault()); links[0]!.click(); assert.equal(pageClick, 0);

  const social = document.createElement('span'); appendSocialMessage(social, 'Hi :heart: https://example.com/?a=1&b=2!');
  assert.equal(social.querySelectorAll('img').length, 1); assert.equal(social.querySelector('a')?.href, 'https://example.com/?a=1&b=2');
  linkifier.start();
  const root = document.querySelector('.chat-content')!;
  const line = document.createElement('p'); const author = document.createElement('b'); author.textContent = 'www.author.test: ';
  const stat = document.createElement('span'); stat.className = 'scd-chat-stat'; stat.textContent = ' · 99 WPM';
  line.append(author, document.createTextNode('See https://skribbl.io/?room=test.'), stat);
  const before = line.textContent; root.appendChild(line);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(line.textContent, before); assert.equal(line.querySelectorAll('a').length, 1);
  assert.equal(line.querySelector('b'), author); assert.equal(line.querySelector('.scd-chat-stat'), stat);
  for (let i = 0; i < 4; i++) linkifier.refresh();
  assert.equal(line.querySelectorAll('a').length, 1, 'Repeated observations must not nest links.');
  const typo = document.createElement('div'); typo.id = 'newChatChatMessages'; typo.textContent = 'https://example.com/typo'; document.body.appendChild(typo);
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(typo.querySelectorAll('a').length, 1);
  assert.ok(document.getElementById('skribbl-duels-chat-links')!.textContent!.includes('text-decoration-color:var(--COLOR_PANEL_BORDER_FOCUS)'));
  console.log('v0.71.0: all 132 emoji assets/aliases, group order, emoji-only rendering, safe chat links and live game/Typo preservation passed.');
} finally { linkifier.stop(); dom.window.close(); }
