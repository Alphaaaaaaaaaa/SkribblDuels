begin;

create table if not exists public.duel_abuse_signals (
  signal_id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  connection_id text,
  match_id text,
  category text not null check (category in ('rate-limit', 'invalid-message', 'telemetry-replay', 'disconnect-abuse')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  reason text not null check (length(reason) between 1 and 200),
  correlation_id text not null check (length(correlation_id) between 1 and 160),
  occurred_at timestamptz not null default now()
);

create index if not exists duel_abuse_signals_account_time_idx
  on public.duel_abuse_signals (account_id, occurred_at desc);
create index if not exists duel_abuse_signals_match_time_idx
  on public.duel_abuse_signals (match_id, occurred_at desc)
  where match_id is not null;

create table if not exists public.duel_account_sanctions (
  sanction_id bigint generated always as identity primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  sanction_type text not null check (sanction_type in ('full-ban', 'matchmaking-ban', 'chat-mute', 'telemetry-block')),
  reason text not null check (length(reason) between 1 and 500),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by text not null default 'operator',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at > starts_at)
);

create index if not exists duel_account_sanctions_active_idx
  on public.duel_account_sanctions (account_id, expires_at desc)
  where revoked_at is null;

alter table public.duel_abuse_signals enable row level security;
alter table public.duel_account_sanctions enable row level security;

revoke all on public.duel_abuse_signals from anon, authenticated;
revoke all on public.duel_account_sanctions from anon, authenticated;
grant all on public.duel_abuse_signals to service_role;
grant all on public.duel_account_sanctions to service_role;
grant usage, select on sequence public.duel_abuse_signals_signal_id_seq to service_role;
grant usage, select on sequence public.duel_account_sanctions_sanction_id_seq to service_role;

create or replace function public.purge_duel_operational_data(p_now timestamptz default now())
returns table (
  abuse_signals_deleted bigint,
  authority_events_deleted bigint,
  terminal_matches_deleted bigint,
  invites_deleted bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_abuse_deleted bigint := 0;
  v_authority_deleted bigint := 0;
  v_matches_deleted bigint := 0;
  v_invites_deleted bigint := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;
  delete from public.duel_abuse_signals
    where occurred_at < p_now - interval '90 days';
  get diagnostics v_abuse_deleted = row_count;

  delete from public.duel_match_authority_events
    where occurred_at < p_now - interval '30 days';
  get diagnostics v_authority_deleted = row_count;

  delete from public.duel_match_authority
    where terminal = true and updated_at < p_now - interval '30 days';
  get diagnostics v_matches_deleted = row_count;

  delete from public.duel_invites
    where (state <> 'waiting' and updated_at < p_now - interval '30 days')
       or (state = 'waiting' and expires_at < p_now - interval '7 days');
  get diagnostics v_invites_deleted = row_count;

  return query select v_abuse_deleted, v_authority_deleted, v_matches_deleted, v_invites_deleted;
end;
$$;

revoke all on function public.purge_duel_operational_data(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_duel_operational_data(timestamptz) to service_role;

commit;
