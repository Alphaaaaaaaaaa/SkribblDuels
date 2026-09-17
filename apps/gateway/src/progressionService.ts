import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import {
  getOfficialWordListStatus,
  getOfficialWords,
  hasOfficialWord,
  normalizeOfficialWord,
  SKRIBBL_LANGUAGE_NAME_BY_ID
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClientMessage,
  GatewayCoinTransactionSummary,
  GatewayServerMessage,
  GatewaySkribbleAttempt,
  GatewaySkribbleMark,
  GatewaySkribbleState,
  GatewaySlotsState
} from '@skribbl-duels/gateway-contracts';
import type {
  GatewayProgressionPersistence,
  GatewaySkribbleDailyRun,
  GatewaySkribbleDailyWord
} from './progressionPersistence';
import {
  generateSlotOutcome,
  type GeneratedSlotOutcome,
  SKRIBBL_SLOTS_HEART_TARGET,
  SKRIBBL_SLOTS_REEL_COUNT,
  SKRIBBL_SLOTS_RULES_VERSION,
  SKRIBBL_SLOTS_SPIN_COST
} from './slotRules';

const SKRIBBLE_MAX_ATTEMPTS = 10;
const SKRIBBLE_MIN_LENGTH = 2;
const SKRIBBLE_MAX_LENGTH = 32;
const SKRIBBLE_RULES_VERSION = 2;
const PRACTICE_SESSION_TTL_MS = 2 * 60 * 60_000;

type SkribbleClientMessage = Extract<GatewayClientMessage, {
  type: 'SKRIBBLE_OPEN' | 'SKRIBBLE_GUESS' | 'SLOTS_OPEN' | 'SLOTS_SPIN';
}>;

interface ActiveSkribbleSession {
  sessionId: string;
  accountId: string;
  mode: 'daily' | 'practice';
  dateKey: string;
  nextDailyAt: number;
  languageId: number;
  languageName: string;
  answer: string;
  canonicalWords: Map<string, string>;
  attempts: GatewaySkribbleAttempt[];
  processedRequestIds: Set<string>;
  status: 'playing' | 'solved' | 'lost';
  rewardAmount: number;
  rewarded: boolean;
  canEarn: boolean;
  updatedAt: number;
}

interface ActiveSlotsSession {
  sessionId: string;
  accountId: string;
  updatedAt: number;
}

export interface GatewayProgressionServiceOptions {
  persistence: GatewayProgressionPersistence;
  dailySecret: string;
  send(accountId: string, message: GatewayServerMessage): void;
  now?: () => number;
  generateSlotOutcome?: () => GeneratedSlotOutcome;
}

function utcDate(now: number): { dateKey: string; nextDailyAt: number } {
  const date = new Date(now);
  const dateKey = date.toISOString().slice(0, 10);
  const nextDailyAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return { dateKey, nextDailyAt };
}

function codePointLength(value: string): number {
  return Array.from(normalizeOfficialWord(value)).length;
}

function scoreGuess(answer: string, guess: string): GatewaySkribbleMark[] {
  const answerCharacters = Array.from(normalizeOfficialWord(answer));
  const guessCharacters = Array.from(normalizeOfficialWord(guess));
  const marks = guessCharacters.map<GatewaySkribbleMark>(() => 'incorrect');
  const remaining = new Map<string, number>();
  for (let index = 0; index < answerCharacters.length; index += 1) {
    const character = answerCharacters[index]!;
    if (guessCharacters[index] === character) {
      marks[index] = 'correct';
    } else {
      remaining.set(character, (remaining.get(character) ?? 0) + 1);
    }
  }
  for (let index = 0; index < guessCharacters.length; index += 1) {
    if (marks[index] === 'correct') continue;
    const character = guessCharacters[index]!;
    const count = remaining.get(character) ?? 0;
    if (count <= 0) continue;
    marks[index] = 'semicorrect';
    remaining.set(character, count - 1);
  }
  return marks;
}

function wordlistHash(words: readonly string[]): string {
  return createHash('sha256').update(words.join('\u0000')).digest('hex');
}

function stateFrom(session: ActiveSkribbleSession): GatewaySkribbleState {
  return {
    sessionId: session.sessionId,
    mode: session.mode,
    dateKey: session.dateKey,
    nextDailyAt: session.nextDailyAt,
    languageId: session.languageId,
    languageName: session.languageName,
    availability: session.answer ? 'ready' : 'unsupported',
    unavailableReason: session.answer
      ? null
      : `The official ${session.languageName} word list is not fetchable, so Skribble is unavailable for this language.`,
    status: session.status,
    answer: session.status === 'playing' ? null : session.answer,
    maxAttempts: SKRIBBLE_MAX_ATTEMPTS,
    minimumLength: SKRIBBLE_MIN_LENGTH,
    maximumLength: SKRIBBLE_MAX_LENGTH,
    attempts: structuredClone(session.attempts),
    canEarn: session.mode === 'daily' && session.canEarn,
    rewarded: session.mode === 'daily' && session.rewarded,
    rewardAmount: session.mode === 'daily' ? session.rewardAmount : 0
  };
}

export class GatewayProgressionService {
  private readonly sessions = new Map<string, ActiveSkribbleSession>();
  private readonly slotsSessions = new Map<string, ActiveSlotsSession>();
  private readonly now: () => number;

  public constructor(private readonly options: GatewayProgressionServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  public async connected(accountId: string): Promise<void> {
    await this.sendBalance(accountId, null, null);
  }

  public async handle(accountId: string, message: SkribbleClientMessage): Promise<void> {
    this.pruneSessions();
    if (message.type === 'SKRIBBLE_OPEN') {
      await this.open(accountId, message.requestId, message.languageId, message.mode);
      return;
    }
    if (message.type === 'SKRIBBLE_GUESS') {
      await this.guess(accountId, message.requestId, message.sessionId, message.guess);
      return;
    }
    if (message.type === 'SLOTS_OPEN') {
      await this.openSlots(accountId, message.requestId);
      return;
    }
    await this.spinSlots(accountId, message.requestId, message.sessionId);
  }

  private async open(
    accountId: string,
    requestId: string,
    languageId: number,
    mode: 'daily' | 'practice'
  ): Promise<void> {
    const now = this.now();
    const { dateKey, nextDailyAt } = utcDate(now);
    const languageName = SKRIBBL_LANGUAGE_NAME_BY_ID[languageId] ?? `Language ${languageId}`;
    const status = getOfficialWordListStatus(languageId, languageName);
    const words = status.state === 'ready'
      ? getOfficialWords(languageId).filter(word => {
          const length = codePointLength(word);
          return length >= SKRIBBLE_MIN_LENGTH && length <= SKRIBBLE_MAX_LENGTH;
        })
      : [];
    const canonicalWords = new Map(words.map(word => [normalizeOfficialWord(word), word]));
    let answer = '';
    let attempts: GatewaySkribbleAttempt[] = [];
    let processedRequestIds = new Set<string>();
    let runStatus: ActiveSkribbleSession['status'] = 'playing';
    let rewardAmount = 0;
    let rewarded = false;
    let canEarn = false;

    if (words.length > 0 && mode === 'daily') {
      const hash = wordlistHash(words);
      const selection = createHmac('sha256', this.options.dailySecret)
        .update(`${dateKey}:${languageId}:${hash}`)
        .digest();
      const selected = words[selection.readUInt32BE(0) % words.length]!;
      const dailyWord: GatewaySkribbleDailyWord = await this.options.persistence.getOrCreateDailyWord({
        dateKey,
        languageId,
        languageName,
        word: selected,
        wordlistHash: hash,
        selectedAt: now
      });
      answer = dailyWord.word;
      const run = await this.options.persistence.getDailyRun(accountId, dateKey, languageId);
      if (run) {
        attempts = structuredClone(run.attempts).slice(0, SKRIBBLE_MAX_ATTEMPTS);
        processedRequestIds = new Set(run.requestIds.slice(-SKRIBBLE_MAX_ATTEMPTS));
        runStatus = run.status;
      }
      const existingReward = await this.options.persistence.getDailySkribbleReward(accountId, dateKey);
      const sourceEntityId = `${dateKey}:${languageId}`;
      if (existingReward?.sourceEntityId === sourceEntityId) {
        rewardAmount = existingReward.amount;
        rewarded = true;
      }
      canEarn = existingReward === null;
      if (runStatus === 'solved' && canEarn) {
        const transaction = await this.rewardDailySolve(
          accountId,
          dateKey,
          languageId,
          Math.max(1, attempts.length),
          now
        );
        rewardAmount = transaction?.amount ?? 0;
        rewarded = transaction !== null;
        canEarn = false;
        await this.saveDailyRun({
          accountId, dateKey, languageId, attempts,
          requestIds: [...processedRequestIds], status: runStatus,
          rewardAmount, rewardedTransactionId: transaction?.transactionId ?? null, updatedAt: now
        });
        if (transaction) await this.sendBalance(accountId, requestId, transaction);
      } else if (run && (run.rewardAmount !== rewardAmount
          || run.rewardedTransactionId !== (rewarded ? existingReward?.transactionId ?? null : null))) {
        await this.saveDailyRun({
          accountId, dateKey, languageId, attempts,
          requestIds: [...processedRequestIds], status: runStatus,
          rewardAmount,
          rewardedTransactionId: rewarded ? existingReward?.transactionId ?? null : null,
          updatedAt: now
        });
      }
    } else if (words.length > 0) {
      answer = words[randomInt(words.length)]!;
    }

    const session: ActiveSkribbleSession = {
      sessionId: randomUUID(),
      accountId,
      mode,
      dateKey,
      nextDailyAt,
      languageId,
      languageName,
      answer,
      canonicalWords,
      attempts,
      processedRequestIds,
      status: runStatus,
      rewardAmount,
      rewarded,
      canEarn,
      updatedAt: now
    };
    this.sessions.set(session.sessionId, session);
    this.options.send(accountId, { type: 'SKRIBBLE_STATE', requestId, state: stateFrom(session) });
  }

  private async guess(accountId: string, requestId: string, sessionId: string, rawGuess: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.accountId !== accountId) {
      const replacement = await this.fallbackSession(accountId);
      this.options.send(accountId, {
        type: 'SKRIBBLE_GUESS_RESULT', requestId, accepted: false,
        reason: 'session-not-found', state: stateFrom(replacement)
      });
      return;
    }
    session.updatedAt = this.now();
    if (session.processedRequestIds.has(requestId)) {
      this.options.send(accountId, {
        type: 'SKRIBBLE_GUESS_RESULT', requestId, accepted: true,
        reason: 'accepted', state: stateFrom(session)
      });
      return;
    }
    if (session.status !== 'playing' || !session.answer) {
      this.options.send(accountId, {
        type: 'SKRIBBLE_GUESS_RESULT', requestId, accepted: false,
        reason: 'session-ended', state: stateFrom(session)
      });
      return;
    }
    const guess = rawGuess.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const length = Array.from(guess).length;
    if (length < SKRIBBLE_MIN_LENGTH || length > SKRIBBLE_MAX_LENGTH) {
      this.options.send(accountId, {
        type: 'SKRIBBLE_GUESS_RESULT', requestId, accepted: false,
        reason: 'invalid-length', state: stateFrom(session)
      });
      return;
    }
    if (!hasOfficialWord(session.languageId, guess)) {
      this.options.send(accountId, {
        type: 'SKRIBBLE_GUESS_RESULT', requestId, accepted: false,
        reason: 'word-not-found', state: stateFrom(session)
      });
      return;
    }
    const canonicalGuess = session.canonicalWords.get(normalizeOfficialWord(guess)) ?? guess;

    const submittedAt = this.now();
    const attempt: GatewaySkribbleAttempt = {
      guess: canonicalGuess,
      marks: scoreGuess(session.answer, canonicalGuess),
      submittedAt
    };
    session.processedRequestIds.add(requestId);
    session.attempts.push(attempt);
    const solved = normalizeOfficialWord(canonicalGuess) === normalizeOfficialWord(session.answer);
    session.status = solved
      ? 'solved'
      : session.attempts.length >= SKRIBBLE_MAX_ATTEMPTS
        ? 'lost'
        : 'playing';

    let rewardTransaction: GatewayCoinTransactionSummary | null = null;
    if (session.mode === 'daily') {
      const run: GatewaySkribbleDailyRun = {
        accountId,
        dateKey: session.dateKey,
        languageId: session.languageId,
        attempts: structuredClone(session.attempts),
        requestIds: [...session.processedRequestIds],
        status: session.status,
        rewardAmount: session.rewardAmount,
        rewardedTransactionId: null,
        updatedAt: submittedAt
      };
      await this.saveDailyRun(run);
      if (solved && session.canEarn) {
        rewardTransaction = await this.rewardDailySolve(
          accountId,
          session.dateKey,
          session.languageId,
          session.attempts.length,
          submittedAt
        );
        session.rewardAmount = rewardTransaction?.amount ?? 0;
        session.rewarded = rewardTransaction !== null;
        session.canEarn = false;
        run.rewardAmount = rewardTransaction?.amount ?? 0;
        run.rewardedTransactionId = rewardTransaction?.transactionId ?? null;
        await this.saveDailyRun(run);
      }
    }

    this.options.send(accountId, {
      type: 'SKRIBBLE_GUESS_RESULT', requestId, accepted: true,
      reason: 'accepted', state: stateFrom(session)
    });
    if (rewardTransaction) await this.sendBalance(accountId, requestId, rewardTransaction);
  }

  private async rewardDailySolve(
    accountId: string,
    dateKey: string,
    languageId: number,
    attempts: number,
    occurredAt: number
  ): Promise<GatewayCoinTransactionSummary | null> {
    const sourceEntityId = `${dateKey}:${languageId}`;
    const existing = await this.options.persistence.getDailySkribbleReward(accountId, dateKey);
    if (existing) return existing.sourceEntityId === sourceEntityId ? existing : null;
    const amount = Math.max(10, 26 - Math.max(1, Math.min(SKRIBBLE_MAX_ATTEMPTS, attempts)));
    try {
      return await this.options.persistence.applyCoinTransaction({
        accountId,
        idempotencyKey: `skribble:daily-solve:${accountId}:${dateKey}`,
        amount,
        entryKind: 'earn',
        sourceSinkType: 'skribble-daily-solve',
        sourceEntityId,
        rulesVersion: SKRIBBLE_RULES_VERSION,
        occurredAt,
        reversalOfTransactionId: null
      });
    } catch (error) {
      // A second language may finish between the preflight lookup and the
      // row-locked ledger mutation. Re-read the authoritative winner so that
      // the losing race becomes a clean, unrewarded solve rather than an
      // ambiguous client error. Unknown persistence failures still surface.
      const winner = await this.options.persistence.getDailySkribbleReward(accountId, dateKey);
      if (winner) return winner.sourceEntityId === sourceEntityId ? winner : null;
      throw error;
    }
  }

  private async sendBalance(
    accountId: string,
    requestId: string | null,
    transaction: GatewayCoinTransactionSummary | null
  ): Promise<void> {
    const account = await this.options.persistence.getCoinAccount(accountId);
    this.options.send(accountId, {
      type: 'COIN_BALANCE',
      requestId,
      balance: account.balance,
      revision: account.revision,
      transaction
    });
  }

  private async saveDailyRun(run: GatewaySkribbleDailyRun): Promise<void> {
    await this.options.persistence.saveDailyRun(run);
  }

  private async fallbackSession(accountId: string): Promise<ActiveSkribbleSession> {
    const { dateKey, nextDailyAt } = utcDate(this.now());
    return {
      sessionId: randomUUID(), accountId, mode: 'practice', dateKey, nextDailyAt,
      languageId: 0, languageName: 'English', answer: '', canonicalWords: new Map(), attempts: [],
      processedRequestIds: new Set(),
      status: 'playing', rewardAmount: 0, rewarded: false, canEarn: false,
      updatedAt: this.now()
    };
  }

  private pruneSessions(): void {
    const cutoff = this.now() - PRACTICE_SESSION_TTL_MS;
    for (const [sessionId, session] of this.sessions) {
      if (session.updatedAt < cutoff) this.sessions.delete(sessionId);
    }
    while (this.sessions.size > 10_000) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.sessions.delete(oldest);
    }
    for (const [sessionId, session] of this.slotsSessions) {
      if (session.updatedAt < cutoff) this.slotsSessions.delete(sessionId);
    }
    while (this.slotsSessions.size > 10_000) {
      const oldest = this.slotsSessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.slotsSessions.delete(oldest);
    }
  }

  private async openSlots(accountId: string, requestId: string): Promise<void> {
    const session: ActiveSlotsSession = { sessionId: randomUUID(), accountId, updatedAt: this.now() };
    this.slotsSessions.set(session.sessionId, session);
    this.options.send(accountId, {
      type: 'SLOTS_STATE',
      requestId,
      state: await this.slotsState(accountId, session.sessionId)
    });
  }

  private async spinSlots(accountId: string, requestId: string, sessionId: string): Promise<void> {
    const session = this.slotsSessions.get(sessionId);
    if (!session || session.accountId !== accountId) {
      const replacement: ActiveSlotsSession = {
        sessionId: randomUUID(), accountId, updatedAt: this.now()
      };
      this.slotsSessions.set(replacement.sessionId, replacement);
      const account = await this.options.persistence.getCoinAccount(accountId);
      this.options.send(accountId, {
        type: 'SLOTS_SPIN_RESULT', requestId, accepted: false, reason: 'session-not-found',
        state: await this.slotsState(accountId, replacement.sessionId), outcome: null,
        coinRevision: account.revision
      });
      return;
    }
    session.updatedAt = this.now();
    const generated = this.options.generateSlotOutcome?.() ?? generateSlotOutcome();
    try {
      const committed = await this.options.persistence.commitSlotSpin({
        accountId,
        requestId,
        spinId: generated.spinId,
        initialIcons: generated.initialIcons,
        effectSteps: generated.effectSteps,
        finalIcons: generated.finalIcons,
        coinReward: generated.coinReward,
        baseFreeSpinReward: generated.baseFreeSpinReward,
        heartCount: generated.heartCount,
        rulesVersion: SKRIBBL_SLOTS_RULES_VERSION,
        occurredAt: this.now()
      });
      const state: GatewaySlotsState = {
        sessionId: session.sessionId,
        rulesVersion: SKRIBBL_SLOTS_RULES_VERSION,
        reelCount: SKRIBBL_SLOTS_REEL_COUNT,
        spinCost: SKRIBBL_SLOTS_SPIN_COST,
        freeSpins: committed.outcome.freeSpinsAfter,
        nextFreeSpinSource: committed.outcome.nextFreeSpinSource,
        heartProgress: committed.outcome.heartProgressAfter,
        heartTarget: SKRIBBL_SLOTS_HEART_TARGET,
        canSpin: committed.outcome.freeSpinsAfter > 0 || committed.outcome.balanceAfter > 0
      };
      this.options.send(accountId, {
        type: 'SLOTS_SPIN_RESULT', requestId, accepted: true, reason: 'accepted',
        state, outcome: committed.outcome, coinRevision: committed.coinRevision
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('SCD_SLOTS_INSUFFICIENT_COINS')) throw error;
      const account = await this.options.persistence.getCoinAccount(accountId);
      this.options.send(accountId, {
        type: 'SLOTS_SPIN_RESULT', requestId, accepted: false, reason: 'insufficient-coins',
        state: await this.slotsState(accountId, session.sessionId), outcome: null,
        coinRevision: account.revision
      });
    }
  }

  private async slotsState(accountId: string, sessionId: string): Promise<GatewaySlotsState> {
    const [slots, coins] = await Promise.all([
      this.options.persistence.getSlotsAccount(accountId),
      this.options.persistence.getCoinAccount(accountId)
    ]);
    return {
      sessionId,
      rulesVersion: SKRIBBL_SLOTS_RULES_VERSION,
      reelCount: SKRIBBL_SLOTS_REEL_COUNT,
      spinCost: SKRIBBL_SLOTS_SPIN_COST,
      freeSpins: slots.freeSpins,
      nextFreeSpinSource: slots.nextFreeSpinSource,
      heartProgress: slots.heartProgress,
      heartTarget: SKRIBBL_SLOTS_HEART_TARGET,
      canSpin: slots.freeSpins > 0 || coins.balance > 0
    };
  }
}

export const SKRIBBLE_SCORING_FOR_TESTING = { scoreGuess, utcDate } as const;
