import * as assert from 'node:assert/strict';
import {
  RANKED_ESTABLISHED_K_FACTOR,
  RANKED_INITIAL_RATING,
  RANKED_NEW_ACCOUNT_PLACEMENTS,
  RANKED_PLACEMENT_K_FACTOR,
  RANKED_REPEAT_PAIR_LIMIT,
  RANKED_RETURNING_ACCOUNT_PLACEMENTS,
  calculateRankedRating,
  rankedMatchRatingEligibility,
  rankedPlacementRequirement,
  softResetRankedRating
} from '../apps/gateway/src/rankedRating';

assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'matchmaking',
  startedAt: 1_000,
  conclusionReason: 'win-target-reached'
}), { eligible: true, reason: null });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'matchmaking',
  startedAt: 1_000,
  conclusionReason: 'player-forfeit'
}), { eligible: true, reason: null });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'matchmaking',
  startedAt: 1_000,
  conclusionReason: 'player-disconnect'
}), { eligible: true, reason: null });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'matchmaking',
  startedAt: 1_000,
  conclusionReason: 'mutual-draw'
}), { eligible: true, reason: null });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'casual',
  origin: 'matchmaking',
  startedAt: 1_000,
  conclusionReason: 'win-target-reached'
}), { eligible: false, reason: 'casual' });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'invite',
  startedAt: 1_000,
  conclusionReason: 'win-target-reached'
}), { eligible: false, reason: 'private-invite' });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'rematch',
  rematchOfRatedMatch: false,
  startedAt: 1_000,
  conclusionReason: 'win-target-reached'
}), { eligible: false, reason: 'unrated-rematch-origin' });
assert.deepEqual(rankedMatchRatingEligibility({
  format: 'ranked',
  origin: 'matchmaking',
  startedAt: null,
  conclusionReason: 'win-target-reached'
}), { eligible: false, reason: 'match-never-started' });

const provisional = calculateRankedRating({
  playerA: { rating: 1_000, placementGamesRemaining: 10 },
  playerB: { rating: 1_000, placementGamesRemaining: 0 },
  outcome: 'player-a-win',
  ratedPairMatchesInWindow: 0
});
assert.equal(provisional.kFactor, RANKED_PLACEMENT_K_FACTOR);
assert.equal(provisional.playerADelta, 32);
assert.equal(provisional.playerBDelta, -32);
assert.equal(provisional.playerANextRating, 1_032);
assert.equal(provisional.playerBNextRating, 968);

const established = calculateRankedRating({
  playerA: { rating: 1_000, placementGamesRemaining: 0 },
  playerB: { rating: 1_000, placementGamesRemaining: 0 },
  outcome: 'player-a-win',
  ratedPairMatchesInWindow: 0
});
assert.equal(established.kFactor, RANKED_ESTABLISHED_K_FACTOR);
assert.equal(established.playerADelta, 16);
assert.equal(established.playerBDelta, -16);

const favouriteWin = calculateRankedRating({
  playerA: { rating: 1_200, placementGamesRemaining: 0 },
  playerB: { rating: 1_000, placementGamesRemaining: 0 },
  outcome: 'player-a-win',
  ratedPairMatchesInWindow: 0
});
assert.equal(favouriteWin.playerADelta, 8);
assert.equal(favouriteWin.playerBDelta, -8);

const underdogWin = calculateRankedRating({
  playerA: { rating: 1_200, placementGamesRemaining: 0 },
  playerB: { rating: 1_000, placementGamesRemaining: 0 },
  outcome: 'player-b-win',
  ratedPairMatchesInWindow: 0
});
assert.equal(underdogWin.playerADelta, -24);
assert.equal(underdogWin.playerBDelta, 24);

const draw = calculateRankedRating({
  playerA: { rating: 1_000, placementGamesRemaining: 0 },
  playerB: { rating: 1_000, placementGamesRemaining: 0 },
  outcome: 'draw',
  ratedPairMatchesInWindow: 0
});
assert.equal(draw.playerADelta, 0);
assert.equal(draw.playerBDelta, 0);

const repeatLimited = calculateRankedRating({
  playerA: { rating: 1_050, placementGamesRemaining: 0 },
  playerB: { rating: 950, placementGamesRemaining: 0 },
  outcome: 'player-a-win',
  ratedPairMatchesInWindow: RANKED_REPEAT_PAIR_LIMIT
});
assert.equal(repeatLimited.eligible, false);
assert.equal(repeatLimited.reason, 'repeat-opponent-limit');
assert.equal(repeatLimited.playerADelta, 0);
assert.equal(repeatLimited.playerBDelta, 0);

assert.equal(softResetRankedRating(1_600), 1_300);
assert.equal(softResetRankedRating(600), 800);
assert.equal(softResetRankedRating(RANKED_INITIAL_RATING), RANKED_INITIAL_RATING);
assert.equal(rankedPlacementRequirement(false), RANKED_NEW_ACCOUNT_PLACEMENTS);
assert.equal(rankedPlacementRequirement(true), RANKED_RETURNING_ACCOUNT_PLACEMENTS);
assert.throws(() => calculateRankedRating({
  playerA: { rating: Number.NaN, placementGamesRemaining: 0 },
  playerB: { rating: 1_000, placementGamesRemaining: 0 },
  outcome: 'draw',
  ratedPairMatchesInWindow: 0
}), /finite non-negative rating/);

console.log('Ranked progression eligibility, Elo, placement, reset and repeat-opponent rules passed.');
