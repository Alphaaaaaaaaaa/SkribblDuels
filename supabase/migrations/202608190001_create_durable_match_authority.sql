begin;

create table if not exists public.duel_match_authority (
  match_id text primary key,
  revision bigint not null check (revision >= 0),
  phase text not null check (phase in ('ready-check', 'draft', 'countdown', 'running', 'finished', 'cancelled')),
  snapshot jsonb not null,
  terminal boolean not null default false,
  terminal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists duel_match_authority_active_idx
  on public.duel_match_authority (terminal, expires_at, updated_at desc);

create table if not exists public.duel_match_idempotency (
  match_id text not null references public.duel_match_authority(match_id) on delete cascade,
  namespace text not null check (namespace in ('action', 'chat', 'claim', 'telemetry')),
  account_id text not null,
  idempotency_key text not null,
  fingerprint text not null,
  result jsonb,
  updated_at timestamptz not null default now(),
  primary key (match_id, namespace, account_id, idempotency_key)
);

create table if not exists public.duel_match_authority_events (
  event_sequence bigint generated always as identity primary key,
  match_id text not null,
  revision bigint not null,
  phase text not null,
  snapshot jsonb not null,
  occurred_at timestamptz not null default now(),
  unique (match_id, revision)
);

create index if not exists duel_match_authority_events_match_idx
  on public.duel_match_authority_events (match_id, event_sequence);

alter table public.duel_match_authority enable row level security;
alter table public.duel_match_idempotency enable row level security;
alter table public.duel_match_authority_events enable row level security;

revoke all on public.duel_match_authority from anon, authenticated;
revoke all on public.duel_match_idempotency from anon, authenticated;
revoke all on public.duel_match_authority_events from anon, authenticated;
grant all on public.duel_match_authority to service_role;
grant all on public.duel_match_idempotency to service_role;
grant all on public.duel_match_authority_events to service_role;
grant usage, select on sequence public.duel_match_authority_events_event_sequence_seq to service_role;

create or replace function public.persist_duel_match_authority(
  p_match_id text,
  p_revision bigint,
  p_phase text,
  p_expires_at timestamptz,
  p_snapshot jsonb,
  p_idempotency jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed bigint := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_match_id is null or length(p_match_id) = 0
      or p_revision < 0
      or p_phase not in ('ready-check', 'draft', 'countdown', 'running', 'finished', 'cancelled')
      or p_snapshot is null
      or jsonb_typeof(coalesce(p_idempotency, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid durable match authority payload';
  end if;

  insert into public.duel_match_authority (
    match_id, revision, phase, snapshot, terminal, terminal_reason, updated_at, expires_at
  ) values (
    p_match_id, p_revision, p_phase, p_snapshot, false, null, now(), p_expires_at
  )
  on conflict (match_id) do update set
    revision = excluded.revision,
    phase = excluded.phase,
    snapshot = excluded.snapshot,
    terminal = false,
    terminal_reason = null,
    updated_at = now(),
    expires_at = excluded.expires_at
  where public.duel_match_authority.revision <= excluded.revision;

  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    return;
  end if;

  delete from public.duel_match_idempotency where match_id = p_match_id;
  insert into public.duel_match_idempotency (
    match_id, namespace, account_id, idempotency_key, fingerprint, result, updated_at
  )
  select
    p_match_id,
    item.namespace,
    item.account_id,
    item.key,
    item.fingerprint,
    item.result,
    now()
  from jsonb_to_recordset(coalesce(p_idempotency, '[]'::jsonb)) as item(
    namespace text,
    account_id text,
    key text,
    fingerprint text,
    result jsonb
  );

  insert into public.duel_match_authority_events (match_id, revision, phase, snapshot)
  values (p_match_id, p_revision, p_phase, p_snapshot)
  on conflict (match_id, revision) do update set
    phase = excluded.phase,
    snapshot = excluded.snapshot,
    occurred_at = now();
end;
$$;

create or replace function public.finalize_duel_match_authority(
  p_match_id text,
  p_reason text,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;
  update public.duel_match_authority set
    terminal = true,
    terminal_reason = left(coalesce(p_reason, 'match-finalized'), 200),
    updated_at = coalesce(p_occurred_at, now()),
    expires_at = greatest(expires_at, coalesce(p_occurred_at, now()) + interval '7 days')
  where match_id = p_match_id;
end;
$$;

revoke all on function public.persist_duel_match_authority(text, bigint, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.finalize_duel_match_authority(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.persist_duel_match_authority(text, bigint, text, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.finalize_duel_match_authority(text, text, timestamptz) to service_role;

commit;
