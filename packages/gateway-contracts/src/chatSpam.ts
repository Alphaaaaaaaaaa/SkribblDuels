export const DUEL_CHAT_SPAM_MESSAGE = 'Spam detected! You\'re sending messages too quickly.';

export const DUEL_CHAT_SPAM_POLICY = {
  minimumIntervalMs: 100,
  scoringIntervalMs: 900,
  reductionIntervalMs: 2_000,
  reductionAmount: 4,
  kickScore: 6,
  toleranceScore: 3
} as const;

export interface DuelChatSpamState {
  score: number;
  lastSentAt: number | null;
}

export interface DuelChatSpamDecision {
  allowed: boolean;
  state: DuelChatSpamState;
}

export function emptyDuelChatSpamState(): DuelChatSpamState {
  return { score: 0, lastSentAt: null };
}

export function evaluateDuelChatSpam(
  previous: DuelChatSpamState,
  now: number
): DuelChatSpamDecision {
  const lastSentAt = typeof previous.lastSentAt === 'number' && Number.isFinite(previous.lastSentAt)
    ? previous.lastSentAt
    : null;
  const elapsed = lastSentAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - lastSentAt);
  const previousScore = Number.isFinite(previous.score) ? Math.floor(previous.score) : 0;
  let score = Math.max(0, Math.min(DUEL_CHAT_SPAM_POLICY.kickScore, previousScore));

  if (elapsed >= DUEL_CHAT_SPAM_POLICY.reductionIntervalMs) {
    score = Math.max(0, score - DUEL_CHAT_SPAM_POLICY.reductionAmount);
  }

  const blockedScore = DUEL_CHAT_SPAM_POLICY.toleranceScore + 1;
  if (elapsed < DUEL_CHAT_SPAM_POLICY.scoringIntervalMs && score > blockedScore) {
    return { allowed: false, state: { score, lastSentAt } };
  }

  if (elapsed < DUEL_CHAT_SPAM_POLICY.minimumIntervalMs) score += 3;
  else if (elapsed < DUEL_CHAT_SPAM_POLICY.scoringIntervalMs) score += 1;

  return {
    allowed: true,
    state: {
      score: Math.min(DUEL_CHAT_SPAM_POLICY.kickScore, score),
      lastSentAt: now
    }
  };
}
