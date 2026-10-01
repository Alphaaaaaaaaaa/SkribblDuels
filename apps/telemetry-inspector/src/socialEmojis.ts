import { EMBEDDED_ICON_ASSETS } from './generatedIconAssets';
import { EMBEDDED_STAT_ICON_ASSETS } from './generatedStatIconAssets';
import { EMBEDDED_PROGRESSION_ASSETS, PROGRESSION_ASSET_PATHS, type ProgressionAssetId } from './generatedProgressionAssets';
import { SOCIAL_EMOJI_DEFINITIONS, ADDITIONAL_SOCIAL_EMOJI_ASSETS } from './generatedSocialEmojiAssets';

const progressionByPath = Object.fromEntries(Object.entries(PROGRESSION_ASSET_PATHS)
  .map(([id, path]) => [path, EMBEDDED_PROGRESSION_ASSETS[id as ProgressionAssetId]]));
const sources = { ...EMBEDDED_ICON_ASSETS, ...EMBEDDED_STAT_ICON_ASSETS, ...progressionByPath, ...ADDITIONAL_SOCIAL_EMOJI_ASSETS };
export const SOCIAL_EMOJIS = SOCIAL_EMOJI_DEFINITIONS.map(item => ({ ...item, source: sources[item.path] ?? '' }));
const byToken = new Map(SOCIAL_EMOJIS.map(item => [item.token as string, item]));

/** Only registered tokens create images; all remaining user text stays plain text. */
export function appendSocialMessage(target: HTMLElement, text: string): void {
  const expression = /:(?:challenge|friend|skribble|slot|stat)\/[a-z0-9_-]+:/g;
  let start = 0;
  for (const match of text.matchAll(expression)) {
    const item = byToken.get(match[0]);
    if (!item?.source) continue;
    target.appendChild(document.createTextNode(text.slice(start, match.index)));
    const image = document.createElement('img');
    image.className = 'scd-social-emoji'; image.src = item.source; image.alt = item.token; image.title = item.label;
    target.appendChild(image); start = match.index! + match[0].length;
  }
  target.appendChild(document.createTextNode(text.slice(start)));
}
