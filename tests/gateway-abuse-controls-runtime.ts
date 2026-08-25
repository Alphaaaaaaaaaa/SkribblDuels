import * as assert from 'node:assert/strict';
import {
  InMemoryGatewayRateLimiter,
  policyForMessage,
  requestIdForMessage
} from '../apps/gateway/src/abuseControls';
import { GatewayMetrics } from '../apps/gateway/src/metrics';

const limiter = new InMemoryGatewayRateLimiter();
const policy = { scope: 'chat' as const, limit: 2, windowMs: 10_000 };
assert.equal((await limiter.consume(policy, 'account-alpha')).allowed, true);
assert.equal((await limiter.consume(policy, 'account-alpha')).allowed, true);
const limited = await limiter.consume(policy, 'account-alpha');
assert.equal(limited.allowed, false);
assert.equal(limited.remaining, 0);
assert.ok(limited.retryAfterMs > 0);
assert.equal((await limiter.consume(policy, 'account-bravo')).allowed, true, 'Limits must be isolated per subject.');

assert.equal(policyForMessage({
  type: 'DUEL_CHAT_SEND',
  matchId: 'match-1',
  clientMessageId: 'chat-1',
  message: 'hello'
}), null, 'Duel Chat uses the authoritative Skribbl-style spam score instead of a fixed window.');
assert.equal(policyForMessage({ type: 'PING', sentAt: 1 }), null);
assert.equal(requestIdForMessage({
  type: 'MATCH_FORFEIT',
  matchId: 'match-1',
  actionId: 'forfeit-1'
}), 'forfeit-1');

const metrics = new GatewayMetrics();
metrics.increment('skribbl_duels_gateway_rate_limited_total', { scope: 'chat' });
metrics.observe('skribbl_duels_gateway_queue_wait_seconds', 0.4, [0.25, 0.5, 1], { format: 'casual' });
metrics.observeOutbound({
  type: 'CLAIM_RESOLUTION',
  matchId: 'match-redacted',
  candidateId: 'candidate-redacted',
  challengeId: 'bloodline',
  definitionVersion: 4,
  ownerAccountId: 'account-redacted',
  accepted: true,
  claimId: 'claim-redacted',
  reason: 'server-telemetry-certified',
  revision: 4,
  occurredAt: 1_800_000_000_000
});
const prometheus = metrics.prometheus();
assert.match(prometheus, /skribbl_duels_gateway_rate_limited_total\{scope="chat"\} 1/);
assert.match(prometheus, /skribbl_duels_gateway_queue_wait_seconds_bucket\{format="casual",le="0.5"\} 1/);
assert.match(prometheus, /skribbl_duels_gateway_claim_resolutions_total\{challenge="bloodline",outcome="accepted",reason="server-telemetry-certified",source="server-telemetry"\} 1/);
assert.doesNotMatch(prometheus, /account-alpha|account-bravo/);

console.log('Gateway abuse controls and PII-safe metrics runtime tests passed.');
