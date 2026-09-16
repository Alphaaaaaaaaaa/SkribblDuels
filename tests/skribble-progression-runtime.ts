import * as assert from 'node:assert/strict';
import { setOfficialWordListForTesting } from '@skribbl-duels/challenge-definitions';
import type {
  GatewayCoinTransactionSummary,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { GatewayProgressionService, SKRIBBLE_SCORING_FOR_TESTING } from '../apps/gateway/src/progressionService';
import type {
  GatewayCoinAccountSnapshot,
  GatewayCoinTransactionInput,
  GatewayProgressionPersistence,
  GatewaySkribbleDailyRun,
  GatewaySkribbleDailyWord
} from '../apps/gateway/src/progressionPersistence';

class MemoryProgressionPersistence implements GatewayProgressionPersistence {
  public balance = 0;
  public revision = 0;
  public words = new Map<string, GatewaySkribbleDailyWord>();
  public runs = new Map<string, GatewaySkribbleDailyRun>();
  public transactions = new Map<string, GatewayCoinTransactionSummary>();

  public async getCoinAccount(): Promise<GatewayCoinAccountSnapshot> {
    return { balance: this.balance, revision: this.revision };
  }

  public async applyCoinTransaction(input: GatewayCoinTransactionInput): Promise<GatewayCoinTransactionSummary> {
    const existing = this.transactions.get(`${input.accountId}:${input.idempotencyKey}`);
    if (existing) return structuredClone(existing);
    if (this.balance + input.amount < 0) throw new Error('Insufficient Skribbl Coins.');
    const transaction: GatewayCoinTransactionSummary = {
      transactionId: `transaction-${this.transactions.size + 1}`,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      sourceSinkType: input.sourceSinkType,
      sourceEntityId: input.sourceEntityId,
      balanceBefore: this.balance,
      balanceAfter: this.balance + input.amount,
      rulesVersion: input.rulesVersion,
      occurredAt: input.occurredAt,
      reversalOfTransactionId: input.reversalOfTransactionId
    };
    this.balance = transaction.balanceAfter;
    this.revision += 1;
    this.transactions.set(`${input.accountId}:${input.idempotencyKey}`, transaction);
    return structuredClone(transaction);
  }

  public async getDailySkribbleReward(
    accountId: string,
    dateKey: string
  ): Promise<GatewayCoinTransactionSummary | null> {
    return structuredClone([...this.transactions.values()].find(transaction =>
      transaction.idempotencyKey === `skribble:daily-solve:${accountId}:${dateKey}`
    ) ?? null);
  }

  public async getOrCreateDailyWord(candidate: GatewaySkribbleDailyWord): Promise<GatewaySkribbleDailyWord> {
    const key = `${candidate.dateKey}:${candidate.languageId}`;
    const value = this.words.get(key) ?? structuredClone(candidate);
    this.words.set(key, value);
    return structuredClone(value);
  }

  public async getDailyRun(
    accountId: string,
    dateKey: string,
    languageId: number
  ): Promise<GatewaySkribbleDailyRun | null> {
    return structuredClone(this.runs.get(`${accountId}:${dateKey}:${languageId}`) ?? null);
  }

  public async saveDailyRun(run: GatewaySkribbleDailyRun): Promise<void> {
    this.runs.set(`${run.accountId}:${run.dateKey}:${run.languageId}`, structuredClone(run));
  }
}

setOfficialWordListForTesting(0, ['array', 'rarer', 'civic', 'apple'], 'English');
setOfficialWordListForTesting(1, ['hallo', 'apfel', 'array'], 'German');

assert.deepEqual(
  SKRIBBLE_SCORING_FOR_TESTING.scoreGuess('array', 'rarer'),
  ['semicorrect', 'semicorrect', 'correct', 'incorrect', 'incorrect'],
  'Duplicate characters must be consumed once after exact matches.'
);

const persistence = new MemoryProgressionPersistence();
const messages: GatewayServerMessage[] = [];
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now = Date.UTC(2026, 8, 16, 12, 0, 0);
const progression = new GatewayProgressionService({
  persistence,
  dailySecret: 'test-skribble-secret-at-least-32-characters',
  now: () => now,
  send(_accountId, message) {
    messages.push(structuredClone(message));
  }
});

await progression.connected(accountId);
assert.deepEqual(messages.at(-1), {
  type: 'COIN_BALANCE', requestId: null, balance: 0, revision: 0, transaction: null
});

await progression.handle(accountId, {
  type: 'SKRIBBLE_OPEN', requestId: 'open-daily', languageId: 0, mode: 'daily'
});
const opened = messages.at(-1);
assert.equal(opened?.type, 'SKRIBBLE_STATE');
if (opened?.type !== 'SKRIBBLE_STATE') throw new Error('Daily state was not returned.');
assert.equal('answer' in opened.state, false, 'The answer must never be shipped in advance.');
assert.equal(opened.state.attempts.length, 0);
assert.equal(opened.state.maxAttempts, 10);
const dailyWord = persistence.words.values().next().value as GatewaySkribbleDailyWord;

await progression.handle(accountId, {
  type: 'SKRIBBLE_GUESS', requestId: 'invalid', sessionId: opened.state.sessionId, guess: 'zzzzz'
});
const invalid = messages.at(-1);
assert.equal(invalid?.type, 'SKRIBBLE_GUESS_RESULT');
if (invalid?.type === 'SKRIBBLE_GUESS_RESULT') {
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.reason, 'word-not-found');
  assert.equal(invalid.state.attempts.length, 0);
}

await progression.handle(accountId, {
  type: 'SKRIBBLE_GUESS', requestId: 'solve', sessionId: opened.state.sessionId, guess: dailyWord.word
});
const solveResult = [...messages].reverse().find(message => message.type === 'SKRIBBLE_GUESS_RESULT');
assert.equal(solveResult?.type, 'SKRIBBLE_GUESS_RESULT');
if (solveResult?.type !== 'SKRIBBLE_GUESS_RESULT') throw new Error('Solve result missing.');
assert.equal(solveResult.state.status, 'solved');
assert.equal(solveResult.state.rewarded, true);
assert.ok(solveResult.state.rewardAmount >= 10 && solveResult.state.rewardAmount <= 25);
const earnedBalance = persistence.balance;
assert.equal(persistence.transactions.size, 1);
await progression.handle(accountId, {
  type: 'SKRIBBLE_GUESS', requestId: 'solve', sessionId: opened.state.sessionId, guess: dailyWord.word
});
const duplicateSolve = messages.at(-1);
if (duplicateSolve?.type !== 'SKRIBBLE_GUESS_RESULT') throw new Error('Duplicate solve result missing.');
assert.equal(duplicateSolve.accepted, true);
assert.equal(duplicateSolve.state.attempts.length, 1, 'A retried request ID must not consume another attempt.');
assert.equal(persistence.transactions.size, 1);

// Simulate a process crash after the ledger commit but before the Daily Run
// stored the transaction link. Reopening must repair the run without paying a
// second reward.
const dailyRunKey = `${accountId}:2026-09-16:0`;
const interruptedRun = persistence.runs.get(dailyRunKey);
if (!interruptedRun) throw new Error('Daily run was not persisted.');
persistence.runs.set(dailyRunKey, {
  ...interruptedRun,
  rewardAmount: 0,
  rewardedTransactionId: null
});
const resumedMessages: GatewayServerMessage[] = [];
const resumedProgression = new GatewayProgressionService({
  persistence,
  dailySecret: 'test-skribble-secret-at-least-32-characters',
  now: () => now,
  send(_accountId, message) {
    resumedMessages.push(structuredClone(message));
  }
});
await resumedProgression.handle(accountId, {
  type: 'SKRIBBLE_OPEN', requestId: 'resume-after-ledger-commit', languageId: 0, mode: 'daily'
});
const resumed = resumedMessages.at(-1);
if (resumed?.type !== 'SKRIBBLE_STATE') throw new Error('Recovered Daily state missing.');
assert.equal(resumed.state.rewarded, true);
assert.equal(resumed.state.rewardAmount, solveResult.state.rewardAmount);
assert.equal(persistence.transactions.size, 1, 'Restart recovery must not duplicate the ledger reward.');
assert.equal(persistence.runs.get(dailyRunKey)?.rewardedTransactionId, [...persistence.transactions.values()][0]?.transactionId);

await progression.handle(accountId, {
  type: 'SKRIBBLE_OPEN', requestId: 'open-german', languageId: 1, mode: 'daily'
});
const german = messages.at(-1);
if (german?.type !== 'SKRIBBLE_STATE') throw new Error('German daily state missing.');
assert.equal(german.state.canEarn, false);
assert.equal(german.state.rewarded, false);
const germanWord = persistence.words.get('2026-09-16:1')!;
await progression.handle(accountId, {
  type: 'SKRIBBLE_GUESS', requestId: 'solve-german', sessionId: german.state.sessionId, guess: germanWord.word
});
assert.equal(persistence.balance, earnedBalance, 'Only the first solve across all languages may reward an account each UTC day.');
assert.equal(persistence.transactions.size, 1);

await progression.handle(accountId, {
  type: 'SKRIBBLE_CELEBRATION_REPLAY', requestId: 'replay-1', dateKey: '2026-09-16'
});
assert.equal(persistence.balance, earnedBalance - 1, 'Celebration replay is the harmless one-Coin cosmetic sink.');
assert.equal(messages.at(-1)?.type, 'COIN_BALANCE');

await progression.handle(accountId, {
  type: 'SKRIBBLE_OPEN', requestId: 'open-practice', languageId: 0, mode: 'practice'
});
const practice = messages.at(-1);
if (practice?.type !== 'SKRIBBLE_STATE') throw new Error('Practice state missing.');
const practiceAnswer = [...persistence.words.values()][0]!.word;
// Practice answer is intentionally private and random. A valid guess remains
// useful for exercising the no-reward path whether or not it solves.
await progression.handle(accountId, {
  type: 'SKRIBBLE_GUESS', requestId: 'practice-guess', sessionId: practice.state.sessionId, guess: practiceAnswer
});
assert.equal(persistence.balance, earnedBalance - 1);

console.log('Authoritative Daily Skribble and Skribbl Coin runtime tests passed.');
