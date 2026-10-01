begin;

create table if not exists public.duel_social_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  availability text not null default 'online' check (availability in ('online', 'idle', 'offline')),
  profile_status_visibility text not null default 'everyone' check (profile_status_visibility in ('everyone', 'friends', 'nobody')),
  lobby_status_visibility text not null default 'friends' check (lobby_status_visibility in ('everyone', 'friends', 'nobody')),
  allow_lobby_join boolean not null default true,
  receive_friend_requests boolean not null default true,
  receive_match_invites boolean not null default true,
  status_challenge_id text,
  status_text text not null default '' check (char_length(status_text) <= 80),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint duel_social_status_challenge_length check (
    status_challenge_id is null or char_length(status_challenge_id) between 1 and 128
  )
);

create table if not exists public.duel_friend_requests (
  request_id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ignored', 'accepted', 'declined', 'withdrawn', 'blocked')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  responded_at timestamptz,
  constraint duel_friend_request_not_self check (sender_id <> recipient_id)
);

create unique index if not exists duel_friend_requests_active_direction
  on public.duel_friend_requests (sender_id, recipient_id)
  where status in ('pending', 'ignored');
create unique index if not exists duel_friend_requests_active_pair
  on public.duel_friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status in ('pending', 'ignored');
create index if not exists duel_friend_requests_recipient_status
  on public.duel_friend_requests (recipient_id, status, created_at desc);
create index if not exists duel_friend_requests_sender_status
  on public.duel_friend_requests (sender_id, status, created_at desc);

create table if not exists public.duel_friendships (
  account_low uuid not null references public.profiles(id) on delete cascade,
  account_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (account_low, account_high),
  constraint duel_friendship_canonical_pair check (account_low::text < account_high::text)
);
create index if not exists duel_friendships_high on public.duel_friendships (account_high);

create table if not exists public.duel_friend_pins (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (owner_id, friend_id),
  constraint duel_friend_pin_not_self check (owner_id <> friend_id)
);

create table if not exists public.duel_social_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (blocker_id, blocked_id),
  constraint duel_social_block_not_self check (blocker_id <> blocked_id)
);

comment on table public.duel_social_preferences is 'Gateway-owned social privacy, visible status, and manual availability preferences.';
comment on table public.duel_friend_requests is 'Durable lifecycle for Skribbl Duels friend requests; ignored requests remain reviewable.';
comment on table public.duel_friendships is 'Canonical, unordered Skribbl Duels friendship pairs.';
comment on table public.duel_friend_pins is 'Per-account friend ordering preferences.';
comment on table public.duel_social_blocks is 'Directional account blocks enforced by the Gateway.';

alter table public.duel_social_preferences enable row level security;
alter table public.duel_friend_requests enable row level security;
alter table public.duel_friendships enable row level security;
alter table public.duel_friend_pins enable row level security;
alter table public.duel_social_blocks enable row level security;

revoke all on table public.duel_social_preferences from public, anon, authenticated;
revoke all on table public.duel_friend_requests from public, anon, authenticated;
revoke all on table public.duel_friendships from public, anon, authenticated;
revoke all on table public.duel_friend_pins from public, anon, authenticated;
revoke all on table public.duel_social_blocks from public, anon, authenticated;
grant all on table public.duel_social_preferences to service_role;
grant all on table public.duel_friend_requests to service_role;
grant all on table public.duel_friendships to service_role;
grant all on table public.duel_friend_pins to service_role;
grant all on table public.duel_social_blocks to service_role;

create or replace function public.touch_duel_social_preferences()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := timezone('utc'::text, now());
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function public.touch_duel_social_preferences() from public, anon, authenticated;
grant execute on function public.touch_duel_social_preferences() to service_role;
drop trigger if exists touch_duel_social_preferences on public.duel_social_preferences;
create trigger touch_duel_social_preferences before update on public.duel_social_preferences
  for each row execute function public.touch_duel_social_preferences();

create or replace function public.gateway_respond_duel_friend_request(
  actor_id uuid, target_request_id uuid, response text
) returns table (
  sender_id uuid, recipient_id uuid, request_status text, request_created_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare
  target public.duel_friend_requests%rowtype;
  pair_low uuid;
  pair_high uuid;
  next_status text;
begin
  if response not in ('accept', 'decline', 'ignore', 'block') then
    raise exception 'Unsupported friend request response';
  end if;
  select * into target from public.duel_friend_requests
  where request_id = target_request_id and recipient_id = actor_id and status in ('pending', 'ignored')
  for update;
  if not found then raise exception 'Friend request not found'; end if;

  pair_low := case when actor_id::text < target.sender_id::text then actor_id else target.sender_id end;
  pair_high := case when actor_id::text < target.sender_id::text then target.sender_id else actor_id end;
  next_status := case response when 'accept' then 'accepted' when 'decline' then 'declined'
    when 'block' then 'blocked' else 'ignored' end;

  if response = 'accept' then
    insert into public.duel_friendships (account_low, account_high) values (pair_low, pair_high)
    on conflict (account_low, account_high) do nothing;
  elsif response = 'block' then
    insert into public.duel_social_blocks (blocker_id, blocked_id) values (actor_id, target.sender_id)
    on conflict (blocker_id, blocked_id) do nothing;
    delete from public.duel_friendships where account_low = pair_low and account_high = pair_high;
    delete from public.duel_friend_pins
    where (owner_id = actor_id and friend_id = target.sender_id)
       or (owner_id = target.sender_id and friend_id = actor_id);
  end if;

  update public.duel_friend_requests
  set status = next_status, responded_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
  where request_id = target_request_id;
  return query select target.sender_id, target.recipient_id, next_status, target.created_at;
end;
$$;
revoke all on function public.gateway_respond_duel_friend_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.gateway_respond_duel_friend_request(uuid,uuid,text) to service_role;

commit;
