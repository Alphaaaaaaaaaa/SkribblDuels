export const RANKED_RATING_RULES_VERSION = 1 as const;
export const RANKED_INITIAL_RATING = 1_000;
export const RANKED_ELO_SCALE = 400;
export const RANKED_PLACEMENT_K_FACTOR = 64;
export const RANKED_ESTABLISHED_K_FACTOR = 32;
export const RANKED_NEW_ACCOUNT_PLACEMENTS = 10;
export const RANKED_RETURNING_ACCOUNT_PLACEMENTS = 5;
export const RANKED_REPEAT_PAIR_LIMIT = 3;
export const RANKED_REPEAT_PAIR_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type RankedMatchOrigin = 'matchmaking' | 'invite' | 'rematch';
export type RankedConclusionReason =
  | 'win-target-reached'
  | 'player-forfeit'
  | 'player-disconnect'
  | 'mutual-draw';
export type RankedRatingOutcome = 'player-a-win' | 'player-b-win' | 'draw';

export interface RankedMatchRatingEligibilityInput {
  readonly format: 'casual' | 'ranked';
  readonly origin: RankedMatchOrigin;
  readonly rematchOfRatedMatch?: boolean | undefined;
  readonly startedAt: number | null;
  readonly conclusionReason: RankedConclusionReason;
}

export type RankedMatchRatingIneligibilityReason =
  | 'casual'
  | 'private-invite'
  | 'unrated-rematch-origin'
  | 'match-never-started';

export type RankedMatchRatingEligibility =
  | { readonly eligible: true; readonly reason: null }
  | { readonly eligible: false; readonly reason: RankedMatchRatingIneligibilityReason };

export interface RankedRatingPlayerState {
  readonly rating: number;
  readonly placementGamesRemaining: number;
}

export interface RankedRatingCalculationInput {
  readonly playerA: RankedRatingPlayerState;
  readonly playerB: RankedRatingPlayerState;
  readonly outcome: RankedRatingOutcome;
  /** Rated conclusions for this exact account pair in the preceding rolling 24 hours. */
  readonly ratedPairMatchesInWindow: number;
}

export interface RankedRatingCalculation {
  readonly rulesVersion: typeof RANKED_RATING_RULES_VERSION;
  readonly eligible: boolean;
  readonly reason: 'rated' | 'repeat-opponent-limit';
  readonly expectedScoreA: number;
  readonly actualScoreA: 0 | 0.5 | 1;
  readonly kFactor: number;
  readonly playerADelta: number;
  readonly playerBDelta: number;
  readonly playerANextRating: number;
  readonly playerBNextRating: number;
}

function requireRating(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative rating.`);
  }
  return Math.round(value);
}

function requireCount(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function actualScore(outcome: RankedRatingOutcome): 0 | 0.5 | 1 {
  if (outcome === 'player-a-win') return 1;
  if (outcome === 'player-b-win') return 0;
  return 0.5;
}

export function rankedMatchRatingEligibility(
  input: RankedMatchRatingEligibilityInput
): RankedMatchRatingEligibility {
  if (input.format !== 'ranked') return { eligible: false, reason: 'casual' };
  if (input.startedAt === null) return { eligible: false, reason: 'match-never-started' };
  if (input.origin === 'invite') return { eligible: false, reason: 'private-invite' };
  if (input.origin === 'rematch' && input.rematchOfRatedMatch !== true) {
    return { eligible: false, reason: 'unrated-rematch-origin' };
  }
  return { eligible: true, reason: null };
}

export function expectedRankedScore(playerRating: number, opponentRating: number): number {
  const player = requireRating(playerRating, 'playerRating');
  const opponent = requireRating(opponentRating, 'opponentRating');
  return 1 / (1 + 10 ** ((opponent - player) / RANKED_ELO_SCALE));
}

export function calculateRankedRating(
  input: RankedRatingCalculationInput
): RankedRatingCalculation {
  const playerARating = requireRating(input.playerA.rating, 'playerA.rating');
  const playerBRating = requireRating(input.playerB.rating, 'playerB.rating');
  const playerAPlacements = requireCount(
    input.playerA.placementGamesRemaining,
    'playerA.placementGamesRemaining'
  );
  const playerBPlacements = requireCount(
    input.playerB.placementGamesRemaining,
    'playerB.placementGamesRemaining'
  );
  const pairMatches = requireCount(input.ratedPairMatchesInWindow, 'ratedPairMatchesInWindow');
  const expectedScoreA = expectedRankedScore(playerARating, playerBRating);
  const scoreA = actualScore(input.outcome);
  const kFactor = playerAPlacements > 0 || playerBPlacements > 0
    ? RANKED_PLACEMENT_K_FACTOR
    : RANKED_ESTABLISHED_K_FACTOR;

  if (pairMatches >= RANKED_REPEAT_PAIR_LIMIT) {
    return {
      rulesVersion: RANKED_RATING_RULES_VERSION,
      eligible: false,
      reason: 'repeat-opponent-limit',
      expectedScoreA,
      actualScoreA: scoreA,
      kFactor,
      playerADelta: 0,
      playerBDelta: 0,
      playerANextRating: playerARating,
      playerBNextRating: playerBRating
    };
  }

  let playerADelta = Math.round(kFactor * (scoreA - expectedScoreA));
  if (input.outcome !== 'draw' && playerADelta === 0) {
    playerADelta = input.outcome === 'player-a-win' ? 1 : -1;
  }
  // Preserve both the zero-sum invariant and the rating floor. At the
  // absolute floor a decisive result can therefore move zero points rather
  // than minting a point that the losing account did not own.
  playerADelta = Math.max(-playerARating, Math.min(playerBRating, playerADelta));
  const playerBDelta = playerADelta === 0 ? 0 : -playerADelta;

  return {
    rulesVersion: RANKED_RATING_RULES_VERSION,
    eligible: true,
    reason: 'rated',
    expectedScoreA,
    actualScoreA: scoreA,
    kFactor,
    playerADelta,
    playerBDelta,
    playerANextRating: Math.max(0, playerARating + playerADelta),
    playerBNextRating: Math.max(0, playerBRating + playerBDelta)
  };
}

export function softResetRankedRating(rating: number): number {
  const current = requireRating(rating, 'rating');
  return Math.round(RANKED_INITIAL_RATING + (current - RANKED_INITIAL_RATING) * 0.5);
}

export function rankedPlacementRequirement(returningAccount: boolean): number {
  return returningAccount
    ? RANKED_RETURNING_ACCOUNT_PLACEMENTS
    : RANKED_NEW_ACCOUNT_PLACEMENTS;
}
