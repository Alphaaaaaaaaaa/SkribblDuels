import { normalizeMatchChatCommandPrefix } from '@skribbl-duels/product-core';

export interface MatchChatCommandResult {
  matched: boolean;
  message: string;
}

export function parseMatchChatCommand(
  value: string,
  configuredPrefix: string
): MatchChatCommandResult {
  const prefix = normalizeMatchChatCommandPrefix(configuredPrefix);
  if (value.toLocaleLowerCase('en-US') === prefix) return { matched: true, message: '' };
  if (!value.toLocaleLowerCase('en-US').startsWith(`${prefix} `)
      && !value.toLocaleLowerCase('en-US').startsWith(`${prefix}\t`)) {
    return { matched: false, message: '' };
  }
  return { matched: true, message: value.slice(prefix.length).trim() };
}

export function isMatchChatCommandPreviewRelevant(
  value: string,
  configuredPrefix: string
): boolean {
  const prefix = normalizeMatchChatCommandPrefix(configuredPrefix);
  const typed = value.trimStart().toLocaleLowerCase('en-US');
  return typed === '/'
    || prefix.startsWith(typed)
    || typed === prefix
    || typed.startsWith(`${prefix} `)
    || typed.startsWith(`${prefix}\t`);
}
