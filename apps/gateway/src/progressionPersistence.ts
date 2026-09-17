import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  GatewayCoinTransactionSummary,
  GatewaySlotEffectStep,
  GatewayFreeSpinSource,
  GatewaySlotIconId,
  GatewaySlotSpinOutcome,
  GatewaySkribbleAttempt
} from '@skribbl-duels/gateway-contracts';

export interface GatewayCoinAccountSnapshot {
  balance: number;
  revision: number;
}

export interface GatewayCoinTransactionInput {
  accountId: string;
  idempotencyKey: string;
  amount: number;
  entryKind: 'earn' | 'sink' | 'reversal';
  sourceSinkType: string;
  sourceEntityId: string;
  rulesVersion: number;
  occurredAt: number;
  reversalOfTransactionId: string | null;
}

export interface GatewaySkribbleDailyWord {
  dateKey: string;
  languageId: number;
  languageName: string;
  word: string;
  wordlistHash: string;
  selectedAt: number;
}

export interface GatewaySkribbleDailyRun {
  accountId: string;
  dateKey: string;
  languageId: number;
  attempts: GatewaySkribbleAttempt[];
  requestIds: string[];
  status: 'playing' | 'solved' | 'lost';
  rewardAmount: number;
  rewardedTransactionId: string | null;
  updatedAt: number;
}

export interface GatewaySlotsAccountSnapshot {
  freeSpins: number;
  nextFreeSpinSource: GatewayFreeSpinSource | null;
  heartProgress: number;
  revision: number;
}

export interface GatewaySlotCommitInput {
  accountId: string;
  requestId: string;
  spinId: string;
  initialIcons: readonly [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId];
  effectSteps: readonly GatewaySlotEffectStep[];
  finalIcons: readonly [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId];
  coinReward: number;
  baseFreeSpinReward: number;
  heartCount: number;
  rulesVersion: number;
  occurredAt: number;
}

export interface GatewaySlotCommitResult {
  outcome: GatewaySlotSpinOutcome;
  coinRevision: number;
}

export interface GatewayProgressionPersistence {
  checkHealth?(): Promise<void>;
  getCoinAccount(accountId: string): Promise<GatewayCoinAccountSnapshot>;
  applyCoinTransaction(input: GatewayCoinTransactionInput): Promise<GatewayCoinTransactionSummary>;
  getDailySkribbleReward(accountId: string, dateKey: string): Promise<GatewayCoinTransactionSummary | null>;
  getOrCreateDailyWord(candidate: GatewaySkribbleDailyWord): Promise<GatewaySkribbleDailyWord>;
  getDailyRun(accountId: string, dateKey: string, languageId: number): Promise<GatewaySkribbleDailyRun | null>;
  saveDailyRun(run: GatewaySkribbleDailyRun): Promise<void>;
  getSlotsAccount(accountId: string): Promise<GatewaySlotsAccountSnapshot>;
  commitSlotSpin(input: GatewaySlotCommitInput): Promise<GatewaySlotCommitResult>;
}

function finiteDate(value: unknown): number {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error('Progression persistence returned an invalid date.');
  return parsed;
}

function coinTransaction(value: unknown): GatewayCoinTransactionSummary {
  if (typeof value !== 'object' || value === null) throw new Error('Coin ledger returned no transaction.');
  const row = value as Record<string, unknown>;
  const result: GatewayCoinTransactionSummary = {
    transactionId: String(row.transaction_id ?? ''),
    idempotencyKey: String(row.idempotency_key ?? ''),
    amount: Number(row.amount),
    sourceSinkType: String(row.source_sink_type ?? ''),
    sourceEntityId: String(row.source_entity_id ?? ''),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    rulesVersion: Number(row.rules_version),
    occurredAt: finiteDate(row.occurred_at),
    reversalOfTransactionId: row.reversal_of_transaction_id === null
      ? null
      : String(row.reversal_of_transaction_id ?? '')
  };
  if (!result.transactionId || !result.idempotencyKey || !Number.isInteger(result.amount)
      || !Number.isInteger(result.balanceBefore) || !Number.isInteger(result.balanceAfter)) {
    throw new Error('Coin ledger returned a malformed transaction.');
  }
  return result;
}

function dailyWord(value: unknown): GatewaySkribbleDailyWord {
  if (typeof value !== 'object' || value === null) throw new Error('Daily Skribble word was not persisted.');
  const row = value as Record<string, unknown>;
  return {
    dateKey: String(row.date_key),
    languageId: Number(row.language_id),
    languageName: String(row.language_name),
    word: String(row.word),
    wordlistHash: String(row.wordlist_hash),
    selectedAt: finiteDate(row.selected_at)
  };
}

function dailyRun(value: unknown): GatewaySkribbleDailyRun | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const attempts = Array.isArray(row.attempts)
    ? row.attempts.filter((attempt): attempt is GatewaySkribbleAttempt => Boolean(
        attempt && typeof attempt === 'object' && typeof (attempt as GatewaySkribbleAttempt).guess === 'string'
      ))
    : [];
  const requestIds = Array.isArray(row.request_ids)
    ? row.request_ids.filter((requestId): requestId is string => (
        typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 256
      )).slice(-10)
    : [];
  const status = row.status === 'solved' || row.status === 'lost' ? row.status : 'playing';
  return {
    accountId: String(row.account_id),
    dateKey: String(row.date_key),
    languageId: Number(row.language_id),
    attempts,
    requestIds,
    status,
    rewardAmount: Number(row.reward_amount ?? 0),
    rewardedTransactionId: row.rewarded_transaction_id === null
      ? null
      : String(row.rewarded_transaction_id ?? ''),
    updatedAt: finiteDate(row.updated_at)
  };
}

function slotsAccount(value: unknown): GatewaySlotsAccountSnapshot {
  if (typeof value !== 'object' || value === null) {
    return { freeSpins: 0, nextFreeSpinSource: null, heartProgress: 0, revision: 0 };
  }
  const row = value as Record<string, unknown>;
  const bookFreeSpins = Number(row.book_free_spins ?? 0);
  const slimyFreeSpins = Number(row.slimy_free_spins ?? 0);
  const heartFreeSpins = Number(row.heart_free_spins ?? 0);
  const nextFreeSpinSource = heartFreeSpins > 0
    ? 'heart'
    : bookFreeSpins > 0
      ? 'book'
      : slimyFreeSpins > 0
        ? 'slimy'
        : null;
  const result = {
    freeSpins: Number(row.free_spins ?? row.freeSpins ?? 0),
    nextFreeSpinSource: nextFreeSpinSource as GatewayFreeSpinSource | null,
    heartProgress: Number(row.heart_progress ?? row.heartProgress ?? 0),
    revision: Number(row.revision ?? 0)
  };
  if (!Number.isSafeInteger(result.freeSpins) || result.freeSpins < 0
      || !Number.isSafeInteger(bookFreeSpins) || bookFreeSpins < 0
      || !Number.isSafeInteger(slimyFreeSpins) || slimyFreeSpins < 0
      || !Number.isSafeInteger(heartFreeSpins) || heartFreeSpins < 0
      || result.freeSpins !== bookFreeSpins + slimyFreeSpins + heartFreeSpins
      || !Number.isSafeInteger(result.heartProgress) || result.heartProgress < 0 || result.heartProgress > 2
      || !Number.isSafeInteger(result.revision) || result.revision < 0) {
    throw new Error('Skribbl Slots persistence returned malformed account state.');
  }
  return result;
}

function slotCommit(value: unknown): GatewaySlotCommitResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Skribbl Slots persistence returned no spin result.');
  }
  const row = value as Record<string, unknown>;
  const effectSteps = Array.isArray(row.effect_steps) ? row.effect_steps as GatewaySlotEffectStep[] : [];
  const initialIcons = row.initial_icons as GatewaySlotIconId[];
  const finalIcons = row.final_icons as GatewaySlotIconId[];
  const usedFreeSpinSource = row.used_free_spin_source === null
    ? null
    : String(row.used_free_spin_source);
  const nextFreeSpinSource = row.next_free_spin_source === null
    ? null
    : String(row.next_free_spin_source);
  if (!Array.isArray(initialIcons) || initialIcons.length !== 3
      || !Array.isArray(finalIcons) || finalIcons.length !== 3
      || (usedFreeSpinSource !== null && usedFreeSpinSource !== 'book'
        && usedFreeSpinSource !== 'slimy' && usedFreeSpinSource !== 'heart')
      || (nextFreeSpinSource !== null && nextFreeSpinSource !== 'book'
        && nextFreeSpinSource !== 'slimy' && nextFreeSpinSource !== 'heart')) {
    throw new Error('Skribbl Slots persistence returned malformed reels.');
  }
  const outcome: GatewaySlotSpinOutcome = {
    spinId: String(row.spin_id ?? ''),
    initialIcons: [initialIcons[0]!, initialIcons[1]!, initialIcons[2]!],
    effectSteps,
    finalIcons: [finalIcons[0]!, finalIcons[1]!, finalIcons[2]!],
    usedFreeSpin: Boolean(row.used_free_spin),
    usedFreeSpinSource: usedFreeSpinSource as GatewayFreeSpinSource | null,
    coinCost: Number(row.coin_cost) === 1 ? 1 : 0,
    coinReward: Number(row.coin_reward),
    awardedFreeSpins: Number(row.awarded_free_spins),
    freeSpinsBefore: Number(row.free_spins_before),
    freeSpinsAfter: Number(row.free_spins_after),
    nextFreeSpinSource: nextFreeSpinSource as GatewayFreeSpinSource | null,
    heartProgressBefore: Number(row.heart_progress_before),
    heartProgressAfter: Number(row.heart_progress_after),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    occurredAt: finiteDate(row.occurred_at)
  };
  const coinRevision = Number(row.coin_revision);
  if (!outcome.spinId || !Number.isSafeInteger(outcome.coinReward)
      || !Number.isSafeInteger(outcome.awardedFreeSpins)
      || !Number.isSafeInteger(outcome.balanceBefore) || !Number.isSafeInteger(outcome.balanceAfter)
      || !Number.isSafeInteger(coinRevision)) {
    throw new Error('Skribbl Slots persistence returned a malformed spin result.');
  }
  return { outcome, coinRevision };
}

export class SupabaseGatewayProgressionPersistence implements GatewayProgressionPersistence {
  private readonly client: SupabaseClient;

  public constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    });
  }

  public async checkHealth(): Promise<void> {
    const { error: coinError } = await this.client
      .from('skribbl_coin_accounts')
      .select('account_id', { head: true, count: 'exact' })
      .limit(1);
    if (coinError) throw new Error(`Skribbl Coin persistence health check failed: ${coinError.message}`);
    const { error: slotsError } = await this.client
      .from('skribbl_slot_accounts')
      .select('account_id', { head: true, count: 'exact' })
      .limit(1);
    if (slotsError) throw new Error(`Skribbl Slots persistence health check failed: ${slotsError.message}`);
  }

  public async getCoinAccount(accountId: string): Promise<GatewayCoinAccountSnapshot> {
    const { data, error } = await this.client
      .from('skribbl_coin_accounts')
      .select('balance, revision')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load Skribbl Coin balance: ${error.message}`);
    return data
      ? { balance: Number(data.balance), revision: Number(data.revision) }
      : { balance: 0, revision: 0 };
  }

  public async applyCoinTransaction(input: GatewayCoinTransactionInput): Promise<GatewayCoinTransactionSummary> {
    const { data, error } = await this.client.rpc('apply_skribbl_coin_transaction', {
      p_account_id: input.accountId,
      p_idempotency_key: input.idempotencyKey,
      p_amount: input.amount,
      p_entry_kind: input.entryKind,
      p_source_sink_type: input.sourceSinkType,
      p_source_entity_id: input.sourceEntityId,
      p_rules_version: input.rulesVersion,
      p_occurred_at: new Date(input.occurredAt).toISOString(),
      p_reversal_of_transaction_id: input.reversalOfTransactionId
    });
    if (error) throw new Error(`Unable to apply Skribbl Coin transaction: ${error.message}`);
    return coinTransaction(data);
  }

  public async getDailySkribbleReward(
    accountId: string,
    dateKey: string
  ): Promise<GatewayCoinTransactionSummary | null> {
    const { data, error } = await this.client
      .from('skribbl_coin_transactions')
      .select('*')
      .eq('account_id', accountId)
      .eq('source_sink_type', 'skribble-daily-solve')
      .like('source_entity_id', `${dateKey}:%`)
      .order('occurred_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Unable to check Daily Skribble reward: ${error.message}`);
    return data ? coinTransaction(data) : null;
  }

  public async getOrCreateDailyWord(candidate: GatewaySkribbleDailyWord): Promise<GatewaySkribbleDailyWord> {
    const { error: insertError } = await this.client
      .from('skribble_daily_words')
      .upsert({
        date_key: candidate.dateKey,
        language_id: candidate.languageId,
        language_name: candidate.languageName,
        word: candidate.word,
        wordlist_hash: candidate.wordlistHash,
        selected_at: new Date(candidate.selectedAt).toISOString()
      }, { onConflict: 'date_key,language_id', ignoreDuplicates: true });
    if (insertError) throw new Error(`Unable to establish Daily Skribble word: ${insertError.message}`);
    const { data, error } = await this.client
      .from('skribble_daily_words')
      .select('*')
      .eq('date_key', candidate.dateKey)
      .eq('language_id', candidate.languageId)
      .single();
    if (error) throw new Error(`Unable to load Daily Skribble word: ${error.message}`);
    return dailyWord(data);
  }

  public async getDailyRun(
    accountId: string,
    dateKey: string,
    languageId: number
  ): Promise<GatewaySkribbleDailyRun | null> {
    const { data, error } = await this.client
      .from('skribble_daily_runs')
      .select('*')
      .eq('account_id', accountId)
      .eq('date_key', dateKey)
      .eq('language_id', languageId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load Daily Skribble run: ${error.message}`);
    return dailyRun(data);
  }

  public async saveDailyRun(run: GatewaySkribbleDailyRun): Promise<void> {
    const { error } = await this.client.from('skribble_daily_runs').upsert({
      account_id: run.accountId,
      date_key: run.dateKey,
      language_id: run.languageId,
      attempts: run.attempts,
      request_ids: run.requestIds,
      status: run.status,
      reward_amount: run.rewardAmount,
      rewarded_transaction_id: run.rewardedTransactionId,
      updated_at: new Date(run.updatedAt).toISOString()
    }, { onConflict: 'account_id,date_key,language_id' });
    if (error) throw new Error(`Unable to persist Daily Skribble run: ${error.message}`);
  }

  public async getSlotsAccount(accountId: string): Promise<GatewaySlotsAccountSnapshot> {
    const { data, error } = await this.client
      .from('skribbl_slot_accounts')
      .select('free_spins, book_free_spins, slimy_free_spins, heart_free_spins, heart_progress, revision')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load Skribbl Slots state: ${error.message}`);
    return slotsAccount(data);
  }

  public async commitSlotSpin(input: GatewaySlotCommitInput): Promise<GatewaySlotCommitResult> {
    const { data, error } = await this.client.rpc('apply_skribbl_slot_spin', {
      p_account_id: input.accountId,
      p_request_id: input.requestId,
      p_spin_id: input.spinId,
      p_initial_icons: input.initialIcons,
      p_effect_steps: input.effectSteps,
      p_final_icons: input.finalIcons,
      p_coin_reward: input.coinReward,
      p_base_free_spin_reward: input.baseFreeSpinReward,
      p_heart_count: input.heartCount,
      p_rules_version: input.rulesVersion,
      p_occurred_at: new Date(input.occurredAt).toISOString()
    });
    if (error) throw new Error(`Unable to commit Skribbl Slots spin: ${error.message}`);
    return slotCommit(data);
  }
}
