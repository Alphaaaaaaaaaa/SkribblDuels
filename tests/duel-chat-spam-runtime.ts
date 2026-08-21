import * as assert from 'node:assert/strict';
import {
  DUEL_CHAT_SPAM_MESSAGE,
  DUEL_CHAT_SPAM_POLICY,
  emptyDuelChatSpamState,
  evaluateDuelChatSpam
} from '@skribbl-duels/gateway-contracts';

assert.equal(DUEL_CHAT_SPAM_MESSAGE, 'Spam detected! You\'re sending messages too quickly.');
assert.deepEqual(DUEL_CHAT_SPAM_POLICY, {
  minimumIntervalMs: 100,
  scoringIntervalMs: 900,
  reductionIntervalMs: 2_000,
  reductionAmount: 4,
  kickScore: 6,
  toleranceScore: 3
});

let state = emptyDuelChatSpamState();
let now = 10_000;
let decision = evaluateDuelChatSpam(state, now);
assert.equal(decision.allowed, true);
state = decision.state;

now += 50;
decision = evaluateDuelChatSpam(state, now);
assert.deepEqual(decision, { allowed: true, state: { score: 3, lastSentAt: now } });
state = decision.state;

now += 50;
decision = evaluateDuelChatSpam(state, now);
assert.deepEqual(decision, { allowed: true, state: { score: 6, lastSentAt: now } });
state = decision.state;

now += 50;
decision = evaluateDuelChatSpam(state, now);
assert.equal(decision.allowed, false);
assert.deepEqual(decision.state, state, 'A blocked submission must not extend the spam cooldown.');

now += 850;
decision = evaluateDuelChatSpam(state, now);
assert.equal(decision.allowed, true, 'The Skribbl scoring interval re-allows a message after 900 ms.');
state = decision.state;

now += 2_000;
decision = evaluateDuelChatSpam(state, now);
assert.equal(decision.allowed, true);
assert.equal(decision.state.score, 2, 'Two seconds of idle time must reduce the score by four.');

console.log('Duel Chat Skribbl-style spam score runtime test passed.');
