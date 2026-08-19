import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DurableMatchPhase =
  | 'ready-check'
  | 'draft'
  | 'countdown'
  | 'running'
  | 'finished'
  | 'cancelled';

export interface GatewayDurableMatchSnapshot {
  snapshotVersion: 1;
  matchId: string;
  revision: number;
  phase: DurableMatchPhase;
  savedAt: number;
  expiresAt: number;
  aggregate: unknown;
  idempotency: Array<{
    namespace: 'action' | 'chat' | 'claim' | 'telemetry';
    accountId: string;
    key: string;
    fingerprint: string;
    result: unknown;
  }>;
}

export interface GatewayMatchAuthorityPersistence {
  loadActiveMatches(now: number): Promise<GatewayDurableMatchSnapshot[]>;
  saveMatch(snapshot: GatewayDurableMatchSnapshot): Promise<void>;
  finalizeMatch(matchId: string, reason: string, occurredAt: number): Promise<void>;
}

interface StoredAuthorityRow {
  snapshot: unknown;
}

function isDurableSnapshot(value: unknown): value is GatewayDurableMatchSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<GatewayDurableMatchSnapshot>;
  return candidate.snapshotVersion === 1
    && typeof candidate.matchId === 'string'
    && Number.isInteger(candidate.revision)
    && typeof candidate.phase === 'string'
    && Number.isFinite(candidate.savedAt)
    && Number.isFinite(candidate.expiresAt)
    && Array.isArray(candidate.idempotency)
    && 'aggregate' in candidate;
}

export class SupabaseGatewayMatchAuthorityPersistence implements GatewayMatchAuthorityPersistence {
  private readonly client: SupabaseClient;

  public constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    });
  }

  public async loadActiveMatches(now: number): Promise<GatewayDurableMatchSnapshot[]> {
    const { data, error } = await this.client
      .from('duel_match_authority')
      .select('snapshot')
      .eq('terminal', false)
      .gt('expires_at', new Date(now).toISOString());
    if (error) throw new Error(`Unable to load durable Duel matches: ${error.message}`);
    return ((data ?? []) as StoredAuthorityRow[])
      .map(row => row.snapshot)
      .filter(isDurableSnapshot)
      .sort((left, right) => left.savedAt - right.savedAt);
  }

  public async saveMatch(snapshot: GatewayDurableMatchSnapshot): Promise<void> {
    const { error } = await this.client.rpc('persist_duel_match_authority', {
      p_match_id: snapshot.matchId,
      p_revision: snapshot.revision,
      p_phase: snapshot.phase,
      p_expires_at: new Date(snapshot.expiresAt).toISOString(),
      p_snapshot: snapshot,
      p_idempotency: snapshot.idempotency
    });
    if (error) throw new Error(`Unable to persist Duel match ${snapshot.matchId}: ${error.message}`);
  }

  public async finalizeMatch(matchId: string, reason: string, occurredAt: number): Promise<void> {
    const { error } = await this.client.rpc('finalize_duel_match_authority', {
      p_match_id: matchId,
      p_reason: reason,
      p_occurred_at: new Date(occurredAt).toISOString()
    });
    if (error) throw new Error(`Unable to finalize Duel match ${matchId}: ${error.message}`);
  }
}

