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

export interface GatewayDurableInviteSnapshot {
  snapshotVersion: 1;
  inviteId: string;
  tokenHash: string;
  creatorAccountId: string;
  createRequestId: string;
  format: 'casual' | 'ranked';
  state: 'waiting' | 'accepted' | 'cancelled' | 'expired';
  createdAt: number;
  expiresAt: number;
  acceptedByAccountId: string | null;
  acceptRequestId: string | null;
  matchId: string | null;
}

export interface GatewayMatchAuthorityPersistence {
  loadActiveMatches(now: number): Promise<GatewayDurableMatchSnapshot[]>;
  saveMatch(snapshot: GatewayDurableMatchSnapshot): Promise<void>;
  finalizeMatch(matchId: string, reason: string, occurredAt: number): Promise<void>;
  loadActiveInvites?(now: number): Promise<GatewayDurableInviteSnapshot[]>;
  createInvite?(snapshot: GatewayDurableInviteSnapshot): Promise<GatewayDurableInviteSnapshot>;
  acceptInvite?(
    tokenHash: string,
    acceptorAccountId: string,
    requestId: string,
    matchId: string,
    occurredAt: number
  ): Promise<GatewayDurableInviteSnapshot | null>;
  cancelInvite?(
    inviteId: string,
    creatorAccountId: string,
    requestId: string,
    occurredAt: number
  ): Promise<GatewayDurableInviteSnapshot | null>;
}

export interface DurableIdempotencyRpcRow {
  namespace: GatewayDurableMatchSnapshot['idempotency'][number]['namespace'];
  account_id: string;
  key: string;
  fingerprint: string;
  result: unknown;
}

export function serializeDurableIdempotency(
  rows: GatewayDurableMatchSnapshot['idempotency']
): DurableIdempotencyRpcRow[] {
  return rows.map(row => ({
    namespace: row.namespace,
    account_id: row.accountId,
    key: row.key,
    fingerprint: row.fingerprint,
    result: row.result
  }));
}

interface StoredAuthorityRow {
  snapshot: unknown;
}

function durableInvite(value: unknown): GatewayDurableInviteSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const snapshot = row.snapshot_version === 1 ? {
    snapshotVersion: 1 as const,
    inviteId: row.invite_id,
    tokenHash: row.token_hash,
    creatorAccountId: row.creator_account_id,
    createRequestId: row.create_request_id,
    format: row.format,
    state: row.state,
    createdAt: Date.parse(String(row.created_at)),
    expiresAt: Date.parse(String(row.expires_at)),
    acceptedByAccountId: row.accepted_by_account_id,
    acceptRequestId: row.accept_request_id,
    matchId: row.match_id
  } : row;
  return snapshot.snapshotVersion === 1
    && typeof snapshot.inviteId === 'string'
    && typeof snapshot.tokenHash === 'string'
    && typeof snapshot.creatorAccountId === 'string'
    && typeof snapshot.createRequestId === 'string'
    && (snapshot.format === 'casual' || snapshot.format === 'ranked')
    && (snapshot.state === 'waiting' || snapshot.state === 'accepted'
      || snapshot.state === 'cancelled' || snapshot.state === 'expired')
    && Number.isFinite(snapshot.createdAt)
    && Number.isFinite(snapshot.expiresAt)
    && (snapshot.acceptedByAccountId === null || typeof snapshot.acceptedByAccountId === 'string')
    && (snapshot.acceptRequestId === null || typeof snapshot.acceptRequestId === 'string')
    && (snapshot.matchId === null || typeof snapshot.matchId === 'string')
    ? snapshot as unknown as GatewayDurableInviteSnapshot
    : null;
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
      p_idempotency: serializeDurableIdempotency(snapshot.idempotency)
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

  public async loadActiveInvites(now: number): Promise<GatewayDurableInviteSnapshot[]> {
    const { data, error } = await this.client
      .from('duel_invites')
      .select('*')
      .eq('state', 'waiting')
      .gt('expires_at', new Date(now).toISOString());
    if (error) throw new Error(`Unable to load durable Duel invites: ${error.message}`);
    return (data ?? []).map(durableInvite).filter((value): value is GatewayDurableInviteSnapshot => value !== null);
  }

  public async createInvite(snapshot: GatewayDurableInviteSnapshot): Promise<GatewayDurableInviteSnapshot> {
    const { data, error } = await this.client.rpc('create_duel_invite', {
      p_invite_id: snapshot.inviteId,
      p_token_hash: snapshot.tokenHash,
      p_creator_account_id: snapshot.creatorAccountId,
      p_create_request_id: snapshot.createRequestId,
      p_format: snapshot.format,
      p_created_at: new Date(snapshot.createdAt).toISOString(),
      p_expires_at: new Date(snapshot.expiresAt).toISOString()
    });
    const parsed = durableInvite(data);
    if (error || !parsed) throw new Error(`Unable to create Duel invite: ${error?.message ?? 'invalid response'}`);
    return parsed;
  }

  public async acceptInvite(
    tokenHash: string,
    acceptorAccountId: string,
    requestId: string,
    matchId: string,
    occurredAt: number
  ): Promise<GatewayDurableInviteSnapshot | null> {
    const { data, error } = await this.client.rpc('accept_duel_invite', {
      p_token_hash: tokenHash,
      p_acceptor_account_id: acceptorAccountId,
      p_accept_request_id: requestId,
      p_match_id: matchId,
      p_occurred_at: new Date(occurredAt).toISOString()
    });
    if (error) throw new Error(`Unable to accept Duel invite: ${error.message}`);
    return durableInvite(data);
  }

  public async cancelInvite(
    inviteId: string,
    creatorAccountId: string,
    requestId: string,
    occurredAt: number
  ): Promise<GatewayDurableInviteSnapshot | null> {
    const { data, error } = await this.client.rpc('cancel_duel_invite', {
      p_invite_id: inviteId,
      p_creator_account_id: creatorAccountId,
      p_cancel_request_id: requestId,
      p_occurred_at: new Date(occurredAt).toISOString()
    });
    if (error) throw new Error(`Unable to cancel Duel invite: ${error.message}`);
    return durableInvite(data);
  }
}
