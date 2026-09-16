import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  GatewayCoinTransactionSummary,
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

export interface GatewayProgressionPersistence {
  checkHealth?(): Promise<void>;
  getCoinAccount(accountId: string): Promise<GatewayCoinAccountSnapshot>;
  applyCoinTransaction(input: GatewayCoinTransactionInput): Promise<GatewayCoinTransactionSummary>;
  getDailySkribbleReward(accountId: string, dateKey: string): Promise<GatewayCoinTransactionSummary | null>;
  getOrCreateDailyWord(candidate: GatewaySkribbleDailyWord): Promise<GatewaySkribbleDailyWord>;
  getDailyRun(accountId: string, dateKey: string, languageId: number): Promise<GatewaySkribbleDailyRun | null>;
  saveDailyRun(run: GatewaySkribbleDailyRun): Promise<void>;
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

export class SupabaseGatewayProgressionPersistence implements GatewayProgressionPersistence {
  private readonly client: SupabaseClient;

  public constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    });
  }

  public async checkHealth(): Promise<void> {
    const { error } = await this.client
      .from('skribbl_coin_accounts')
      .select('account_id', { head: true, count: 'exact' })
      .limit(1);
    if (error) throw new Error(`Skribbl Coin persistence health check failed: ${error.message}`);
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
}
