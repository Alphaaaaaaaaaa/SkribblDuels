import * as assert from 'node:assert/strict';
import type {
  GatewayCoinTransactionSummary,
  GatewayServerMessage,
  GatewaySlotSpinOutcome
} from '@skribbl-duels/gateway-contracts';
import {
  GATEWAY_SLOT_BASE_WEIGHTS,
  GATEWAY_SLOT_ICON_IDS
} from '@skribbl-duels/gateway-contracts';
import {
  GatewayProgressionService
} from '../apps/gateway/src/progressionService';
import {
  generateSlotOutcome,
  SKRIBBL_SLOTS_RULES_FOR_TESTING,
  type GeneratedSlotOutcome
} from '../apps/gateway/src/slotRules';
import type {
  GatewayCoinAccountSnapshot,
  GatewayCoinTransactionInput,
  GatewayProgressionPersistence,
  GatewaySkribbleDailyRun,
  GatewaySkribbleDailyWord,
  GatewaySlotCommitInput,
  GatewaySlotCommitResult,
  GatewaySlotsAccountSnapshot
} from '../apps/gateway/src/progressionPersistence';

function pickIndex(ids: readonly (keyof typeof GATEWAY_SLOT_BASE_WEIGHTS)[], target: keyof typeof GATEWAY_SLOT_BASE_WEIGHTS): number {
  let offset = 0;
  for (const id of ids) {
    if (id === target) return offset;
    offset += GATEWAY_SLOT_BASE_WEIGHTS[id];
  }
  throw new Error(`Missing weighted icon ${target}.`);
}

const forced = [
  pickIndex(GATEWAY_SLOT_ICON_IDS, 'skull'),
  pickIndex(GATEWAY_SLOT_ICON_IDS, 'fill'),
  pickIndex(GATEWAY_SLOT_ICON_IDS, 'poop'),
  pickIndex(SKRIBBL_SLOTS_RULES_FOR_TESTING.NON_EFFECT_IDS, 'ribbon'),
  0
];
const fillOutcome = generateSlotOutcome(maximum => {
  const value = forced.shift();
  assert.notEqual(value, undefined);
  assert.ok(value! < maximum);
  return value!;
}, '11111111-1111-4111-8111-111111111111');
assert.deepEqual(fillOutcome.initialIcons, ['skull', 'fill', 'poop']);
assert.deepEqual(fillOutcome.effectSteps.map(step => step.kind), ['fill']);
assert.deepEqual(fillOutcome.effectSteps[0]?.targetIndices, [1, 0, 2]);
assert.deepEqual(fillOutcome.finalIcons, ['ribbon', 'ribbon', 'ribbon']);
assert.equal(fillOutcome.coinReward, 1);
assert.equal(fillOutcome.baseFreeSpinReward, 0);
assert.deepEqual(
  SKRIBBL_SLOTS_RULES_FOR_TESTING.EFFECT_ORDER,
  ['fill', 'wizard', 'eraser', 'trash', 'dice'],
  'Special effects must always resolve in the documented deployment order.'
);

let seed = 0x51f15e;
const randomIndex = (maximum: number): number => {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed % maximum;
};
let returnedValue = 0;
const simulationCount = 120_000;
for (let index = 0; index < simulationCount; index += 1) {
  const outcome = generateSlotOutcome(randomIndex, `simulation-${index}`);
  returnedValue += outcome.coinReward + outcome.baseFreeSpinReward + outcome.heartCount / 3;
}
const simulatedReturn = returnedValue / simulationCount;
assert.ok(simulatedReturn > 0.06 && simulatedReturn < 0.14, `Unexpected Slots return ${simulatedReturn}.`);
assert.ok(simulatedReturn < 1, 'The base rules must remain a bounded Coin sink.');

class MemoryProgressionPersistence implements GatewayProgressionPersistence {
  public balance = 2;
  public coinRevision = 0;
  public freeSpinsBySource = { book: 0, slimy: 0, heart: 0 };
  public heartProgress = 0;
  public slotRevision = 0;
  public readonly commits = new Map<string, GatewaySlotCommitResult>();

  private freeSpinSource(): 'book' | 'slimy' | 'heart' | null {
    return this.freeSpinsBySource.heart > 0
      ? 'heart'
      : this.freeSpinsBySource.book > 0
        ? 'book'
        : this.freeSpinsBySource.slimy > 0
          ? 'slimy'
          : null;
  }

  private freeSpins(): number {
    return this.freeSpinsBySource.book + this.freeSpinsBySource.slimy + this.freeSpinsBySource.heart;
  }

  public async getCoinAccount(): Promise<GatewayCoinAccountSnapshot> {
    return { balance: this.balance, revision: this.coinRevision };
  }

  public async applyCoinTransaction(_input: GatewayCoinTransactionInput): Promise<GatewayCoinTransactionSummary> {
    throw new Error('Not used by this Slots-only persistence double.');
  }

  public async getDailySkribbleReward(): Promise<GatewayCoinTransactionSummary | null> { return null; }
  public async getOrCreateDailyWord(candidate: GatewaySkribbleDailyWord): Promise<GatewaySkribbleDailyWord> { return candidate; }
  public async getDailyRun(): Promise<GatewaySkribbleDailyRun | null> { return null; }
  public async saveDailyRun(): Promise<void> {}

  public async getSlotsAccount(): Promise<GatewaySlotsAccountSnapshot> {
    return {
      freeSpins: this.freeSpins(),
      nextFreeSpinSource: this.freeSpinSource(),
      heartProgress: this.heartProgress,
      revision: this.slotRevision
    };
  }

  public async commitSlotSpin(input: GatewaySlotCommitInput): Promise<GatewaySlotCommitResult> {
    const key = `${input.accountId}:${input.requestId}`;
    const existing = this.commits.get(key);
    if (existing) return structuredClone(existing);
    const usedFreeSpinSource = this.freeSpinSource();
    const usedFreeSpin = usedFreeSpinSource !== null;
    const coinCost = usedFreeSpin ? 0 : 1;
    if (coinCost > this.balance) throw new Error('SCD_SLOTS_INSUFFICIENT_COINS');
    const freeSpinsBefore = this.freeSpins();
    const heartProgressBefore = this.heartProgress;
    const totalHearts = this.heartProgress + input.heartCount;
    const heartReward = Math.floor(totalHearts / 3);
    const awardedFreeSpins = input.baseFreeSpinReward + heartReward;
    if (usedFreeSpinSource) this.freeSpinsBySource[usedFreeSpinSource] -= 1;
    if (input.baseFreeSpinReward > 0) {
      const source = input.finalIcons[0] === 'slimy' ? 'slimy' : 'book';
      this.freeSpinsBySource[source] += input.baseFreeSpinReward;
    }
    this.freeSpinsBySource.heart += heartReward;
    this.heartProgress = totalHearts % 3;
    const balanceBefore = this.balance;
    this.balance = this.balance - coinCost + input.coinReward;
    this.coinRevision += Number(coinCost > 0) + Number(input.coinReward > 0);
    this.slotRevision += 1;
    const outcome: GatewaySlotSpinOutcome = {
      spinId: input.spinId,
      initialIcons: input.initialIcons,
      effectSteps: input.effectSteps,
      finalIcons: input.finalIcons,
      usedFreeSpin,
      usedFreeSpinSource,
      coinCost,
      coinReward: input.coinReward,
      awardedFreeSpins,
      freeSpinsBefore,
      freeSpinsAfter: this.freeSpins(),
      nextFreeSpinSource: this.freeSpinSource(),
      heartProgressBefore,
      heartProgressAfter: this.heartProgress,
      balanceBefore,
      balanceAfter: this.balance,
      occurredAt: input.occurredAt
    };
    const committed = { outcome, coinRevision: this.coinRevision };
    this.commits.set(key, structuredClone(committed));
    return committed;
  }
}

const persistence = new MemoryProgressionPersistence();
const messages: GatewayServerMessage[] = [];
let generated: GeneratedSlotOutcome = {
  ...fillOutcome,
  spinId: '22222222-2222-4222-8222-222222222222'
};
const service = new GatewayProgressionService({
  persistence,
  dailySecret: 'test-skribble-secret-at-least-32-characters',
  now: () => Date.UTC(2026, 8, 17, 12),
  generateSlotOutcome: () => structuredClone(generated),
  send(_accountId, message) { messages.push(structuredClone(message)); }
});
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await service.handle(accountId, { type: 'SLOTS_OPEN', requestId: 'open-slots' });
const opened = messages.at(-1);
if (opened?.type !== 'SLOTS_STATE') throw new Error('Slots state missing.');
assert.equal(opened.state.reelCount, 3);
assert.equal(opened.state.spinCost, 1);
assert.equal(opened.state.canSpin, true);

await service.handle(accountId, {
  type: 'SLOTS_SPIN', requestId: 'spin-once', sessionId: opened.state.sessionId
});
const first = messages.at(-1);
if (first?.type !== 'SLOTS_SPIN_RESULT') throw new Error('Slots spin result missing.');
assert.equal(first.accepted, true);
assert.deepEqual(first.outcome?.finalIcons, ['ribbon', 'ribbon', 'ribbon']);
assert.equal(first.outcome?.coinCost, 1);
assert.equal(first.outcome?.coinReward, 1);
assert.equal(persistence.balance, 2);
assert.equal(persistence.commits.size, 1);

await service.handle(accountId, {
  type: 'SLOTS_SPIN', requestId: 'spin-once', sessionId: opened.state.sessionId
});
const duplicate = messages.at(-1);
if (duplicate?.type !== 'SLOTS_SPIN_RESULT') throw new Error('Idempotent Slots result missing.');
assert.deepEqual(duplicate.outcome, first.outcome);
assert.equal(persistence.balance, 2, 'A replayed request must neither spend nor reward twice.');
assert.equal(persistence.commits.size, 1);

generated = {
  spinId: '33333333-3333-4333-8333-333333333333',
  initialIcons: ['book', 'book', 'book'], effectSteps: [], finalIcons: ['book', 'book', 'book'],
  coinReward: 0, baseFreeSpinReward: 5, heartCount: 0
};
await service.handle(accountId, {
  type: 'SLOTS_SPIN', requestId: 'win-book-spins', sessionId: opened.state.sessionId
});
const bookWin = messages.at(-1);
if (bookWin?.type !== 'SLOTS_SPIN_RESULT' || !bookWin.outcome) throw new Error('Book reward missing.');
assert.equal(bookWin.outcome.awardedFreeSpins, 5);
assert.equal(bookWin.state.freeSpins, 5);
assert.equal(bookWin.state.nextFreeSpinSource, 'book');

generated = {
  spinId: '44444444-4444-4444-8444-444444444444',
  initialIcons: ['skull', 'poop', 'ribbon'], effectSteps: [], finalIcons: ['skull', 'poop', 'ribbon'],
  coinReward: 0, baseFreeSpinReward: 0, heartCount: 0
};
await service.handle(accountId, {
  type: 'SLOTS_SPIN', requestId: 'use-book-spin', sessionId: opened.state.sessionId
});
const freeSpin = messages.at(-1);
if (freeSpin?.type !== 'SLOTS_SPIN_RESULT' || !freeSpin.outcome) throw new Error('Free Spin result missing.');
assert.equal(freeSpin.outcome.coinCost, 0);
assert.equal(freeSpin.outcome.usedFreeSpinSource, 'book');
assert.equal(freeSpin.state.nextFreeSpinSource, 'book');
assert.equal(freeSpin.state.freeSpins, 4);

console.log(`Authoritative Skribbl Slots runtime passed with simulated return ${simulatedReturn.toFixed(4)}.`);
