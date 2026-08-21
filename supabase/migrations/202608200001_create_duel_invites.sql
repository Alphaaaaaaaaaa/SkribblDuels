begin;

create table if not exists public.duel_invites (
  invite_id text primary key,
  snapshot_version integer not null default 1 check (snapshot_version = 1),
  token_hash text not null unique,
  creator_account_id text not null,
  create_request_id text not null,
  format text not null check (format in ('casual', 'ranked')),
  state text not null default 'waiting' check (state in ('waiting', 'accepted', 'cancelled', 'expired')),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_by_account_id text,
  accept_request_id text,
  cancel_request_id text,
  match_id text,
  updated_at timestamptz not null default now(),
  unique (creator_account_id, create_request_id)
);

create index if not exists duel_invites_waiting_idx
  on public.duel_invites (state, expires_at);

alter table public.duel_invites enable row level security;
revoke all on public.duel_invites from anon, authenticated;
grant all on public.duel_invites to service_role;

create or replace function public.create_duel_invite(
  p_invite_id text,
  p_token_hash text,
  p_creator_account_id text,
  p_create_request_id text,
  p_format text,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.duel_invites%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  if coalesce(length(p_invite_id), 0) = 0
      or coalesce(length(p_token_hash), 0) < 32
      or coalesce(length(p_creator_account_id), 0) = 0
      or coalesce(length(p_create_request_id), 0) = 0
      or p_format not in ('casual', 'ranked')
      or p_created_at is null
      or p_expires_at <= p_created_at then
    raise exception 'invalid Duel invite payload';
  end if;

  insert into public.duel_invites (
    invite_id, token_hash, creator_account_id, create_request_id,
    format, state, created_at, expires_at
  ) values (
    p_invite_id, p_token_hash, p_creator_account_id, p_create_request_id,
    p_format, 'waiting', p_created_at, p_expires_at
  )
  on conflict (creator_account_id, create_request_id) do update
    set updated_at = now()
  returning * into v_invite;

  return to_jsonb(v_invite);
end;
$$;

create or replace function public.accept_duel_invite(
  p_token_hash text,
  p_acceptor_account_id text,
  p_accept_request_id text,
  p_match_id text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.duel_invites%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  select * into v_invite from public.duel_invites
    where token_hash = p_token_hash for update;
  if not found then return null; end if;

  if v_invite.state = 'accepted'
      and v_invite.accepted_by_account_id = p_acceptor_account_id
      and v_invite.accept_request_id = p_accept_request_id then
    return to_jsonb(v_invite);
  end if;
  if v_invite.state <> 'waiting' or v_invite.creator_account_id = p_acceptor_account_id then
    return null;
  end if;
  if v_invite.expires_at <= coalesce(p_occurred_at, now()) then
    update public.duel_invites set state = 'expired', updated_at = now()
      where invite_id = v_invite.invite_id returning * into v_invite;
    return null;
  end if;

  update public.duel_invites set
    state = 'accepted',
    accepted_by_account_id = p_acceptor_account_id,
    accept_request_id = p_accept_request_id,
    match_id = p_match_id,
    updated_at = coalesce(p_occurred_at, now())
  where invite_id = v_invite.invite_id and state = 'waiting'
  returning * into v_invite;
  if not found then return null; end if;
  return to_jsonb(v_invite);
end;
$$;

create or replace function public.cancel_duel_invite(
  p_invite_id text,
  p_creator_account_id text,
  p_cancel_request_id text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.duel_invites%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  select * into v_invite from public.duel_invites
    where invite_id = p_invite_id and creator_account_id = p_creator_account_id for update;
  if not found then return null; end if;
  if v_invite.state = 'cancelled' and v_invite.cancel_request_id = p_cancel_request_id then
    return to_jsonb(v_invite);
  end if;
  if v_invite.state <> 'waiting' then return null; end if;

  update public.duel_invites set
    state = 'cancelled',
    cancel_request_id = p_cancel_request_id,
    updated_at = coalesce(p_occurred_at, now())
  where invite_id = p_invite_id and state = 'waiting'
  returning * into v_invite;
  if not found then return null; end if;
  return to_jsonb(v_invite);
end;
$$;

revoke all on function public.create_duel_invite(text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.accept_duel_invite(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_duel_invite(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_duel_invite(text, text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.accept_duel_invite(text, text, text, text, timestamptz) to service_role;
grant execute on function public.cancel_duel_invite(text, text, text, timestamptz) to service_role;

commit;
