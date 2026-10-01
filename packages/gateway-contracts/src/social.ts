export const GATEWAY_PROFILE_STAT_IDS = [
  'observed-play-time',
  'unique-users-seen',
  'distinct-lobbies',
  'lobby-sessions',
  'play-days',
  'play-day-streak',
  'longest-session',
  'submitted-messages',
  'average-typing-wpm',
  'median-typing-wpm',
  'p90-typing-wpm',
  'best-typing-wpm',
  'typing-trend',
  'guess-attempts',
  'guess-accuracy',
  'first-guesser-rate',
  'average-guess-wpm',
  'median-guess-wpm',
  'p90-guess-wpm',
  'best-guess-wpm',
  'average-guess-time',
  'median-guess-time',
  'p90-guess-time',
  'best-guess-time',
  'guess-wpm-trend',
  'guess-time-trend',
  'drawing-effectiveness',
  'drawing-round-score',
  'drawing-rounds',
  'drawing-reactions',
  'skribbl-wins',
  'skribbl-win-rate',
  'skribbl-win-streak',
  'best-public-score',
  'best-private-score',
  'duel-matches',
  'duel-wins',
  'duel-win-rate',
  'duel-win-streak',
  'challenges-completed',
  'social-actions',
  'unique-words-seen',
  'unique-words-guessed',
  'seen-word-coverage',
  'guessed-word-coverage'
] as const;

export const FRIEND_MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const FRIEND_MESSAGE_PAGE_SIZE = 200;

/** Pins take priority, followed by active Duels, online, idle and offline. */
export function compareSocialFriends(
  left: { pinned: boolean; presence: string; displayName: string; accountId: string },
  right: { pinned: boolean; presence: string; displayName: string; accountId: string }
): number {
  const priority: Record<string, number> = { duel: 0, online: 1, idle: 2, offline: 3 };
  return Number(right.pinned) - Number(left.pinned)
    || (priority[left.presence] ?? 3) - (priority[right.presence] ?? 3)
    || left.displayName.localeCompare(right.displayName)
    || left.accountId.localeCompare(right.accountId);
}
