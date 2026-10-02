import { EMBEDDED_ICON_ASSETS } from './generatedIconAssets';
import { EMBEDDED_STAT_ICON_ASSETS } from './generatedStatIconAssets';
import { EMBEDDED_PROGRESSION_ASSETS, PROGRESSION_ASSET_PATHS, type ProgressionAssetId } from './generatedProgressionAssets';
import { SOCIAL_EMOJI_DEFINITIONS, LEGACY_SOCIAL_EMOJI_DEFINITIONS, ADDITIONAL_SOCIAL_EMOJI_ASSETS } from './generatedSocialEmojiAssets';
import { appendChatText } from './chatLinks';

const progressionByPath = Object.fromEntries(Object.entries(PROGRESSION_ASSET_PATHS)
  .map(([id, path]) => [path, EMBEDDED_PROGRESSION_ASSETS[id as ProgressionAssetId]]));
const sources = { ...EMBEDDED_ICON_ASSETS, ...EMBEDDED_STAT_ICON_ASSETS, ...progressionByPath, ...ADDITIONAL_SOCIAL_EMOJI_ASSETS };
export const SOCIAL_EMOJIS = SOCIAL_EMOJI_DEFINITIONS.map(item => ({ ...item, source: sources[item.path] ?? '' }));
const byToken = new Map<string, { source: string; token: string; label: string }>(
  LEGACY_SOCIAL_EMOJI_DEFINITIONS.map(item => [item.token, { ...item, source: sources[item.path] ?? '' }])
);
for (const item of SOCIAL_EMOJIS) {
  byToken.set(item.token, item);
  for (const alias of item.aliases) byToken.set(alias, item);
}
export const SOCIAL_EMOJI_GROUPS = [...new Set(SOCIAL_EMOJIS.map(item => item.group))];
const TOKEN_EXPRESSION = /:(?:(?:challenge|friend|skribble|slot|stat)\/)?[a-z0-9_+\-]+:/g;

export function isEmojiOnlyMessage(text: string): boolean {
  let count = 0;
  const remaining = text.replace(TOKEN_EXPRESSION, token => {
    if (!byToken.get(token)?.source) return token;
    count++; return '';
  });
  return count > 0 && remaining.trim() === '';
}

/** Only registered tokens create images; all remaining user text stays plain text. */
export function appendSocialMessage(target: HTMLElement, text: string): void {
  target.classList.toggle('scd-social-emoji-only', isEmojiOnlyMessage(text));
  const fragment = document.createDocumentFragment();
  appendChatText(fragment, text);
  // URLs are parsed first: emoji-like path/query text must stay in its anchor.
  for (const node of Array.from(fragment.childNodes)) {
    if (node.nodeType !== 3) { target.appendChild(node); continue; }
    const segment = node.textContent ?? '';
    let start = 0;
    for (const match of segment.matchAll(TOKEN_EXPRESSION)) {
      const item = byToken.get(match[0]);
      if (!item?.source) continue;
      target.appendChild(document.createTextNode(segment.slice(start, match.index)));
      const image = document.createElement('img');
      image.className = 'scd-social-emoji'; image.src = item.source; image.alt = '';
      target.appendChild(image); start = match.index! + match[0].length;
    }
    target.appendChild(document.createTextNode(segment.slice(start)));
  }
}
