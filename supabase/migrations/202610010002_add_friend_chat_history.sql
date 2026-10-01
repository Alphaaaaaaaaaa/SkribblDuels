begin;

alter table public.duel_social_preferences
  add column if not exists pinned_stats jsonb not null default '[]'::jsonb;
alter table public.duel_social_preferences drop constraint if exists duel_social_pinned_stats_shape;
alter table public.duel_social_preferences add constraint duel_social_pinned_stats_shape
  check (jsonb_typeof(pinned_stats) = 'array' and jsonb_array_length(pinned_stats) <= 2);

create table if not exists public.duel_friend_messages (
  message_id uuid primary key default gen_random_uuid(),
  message_sequence bigint generated always as identity unique,
  client_message_id text not null check (char_length(client_message_id) between 1 and 128),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null check (char_length(btrim(message_text)) between 1 and 300),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint duel_friend_message_not_self check (sender_id <> recipient_id),
  unique (sender_id, client_message_id)
);
create index if not exists duel_friend_messages_pair_sequence
  on public.duel_friend_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), message_sequence desc);
create index if not exists duel_friend_messages_unread
  on public.duel_friend_messages (recipient_id, sender_id, message_sequence) where read_at is null;
create index if not exists duel_friend_messages_expiry on public.duel_friend_messages (created_at);
alter table public.duel_friend_messages enable row level security;
revoke all on public.duel_friend_messages from public, anon, authenticated;
grant all on public.duel_friend_messages to service_role;
grant usage, select on sequence public.duel_friend_messages_message_sequence_seq to service_role;
comment on table public.duel_friend_messages is 'Gateway-only friendship chat with a rolling 24-hour retention window and idempotent sends.';

create or replace function public.gateway_purge_duel_friend_messages()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed_count integer;
begin
  delete from public.duel_friend_messages as expired where expired.created_at < now() - interval '24 hours';
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function public.gateway_purge_duel_friend_messages() from public, anon, authenticated;
grant execute on function public.gateway_purge_duel_friend_messages() to service_role;

create or replace function public.gateway_store_duel_friend_message(
  actor_id uuid, target_id uuid, client_id text, body text
) returns public.duel_friend_messages language plpgsql security definer set search_path = '' as $$
declare result_row public.duel_friend_messages%rowtype;
begin
  if actor_id = target_id or char_length(btrim(body)) not between 1 and 300
    or char_length(client_id) not between 1 and 128 then raise exception 'INVALID_FRIEND_MESSAGE'; end if;
  -- The friendship row lock serializes this send with removal or blocking.
  perform 1 from public.duel_friendships as friendship
  where friendship.account_low = least(actor_id, target_id) and friendship.account_high = greatest(actor_id, target_id)
  for key share;
  if not found or exists (select 1 from public.duel_social_blocks as block_row
    where (block_row.blocker_id = actor_id and block_row.blocked_id = target_id)
       or (block_row.blocker_id = target_id and block_row.blocked_id = actor_id))
  then raise exception 'FRIEND_NOT_FOUND'; end if;

  -- Serialize capacity checks and duplicate retries without trusting client timestamps.
  perform pg_advisory_xact_lock(70690017);
  perform public.gateway_purge_duel_friend_messages();
  select message_row.* into result_row from public.duel_friend_messages as message_row
    where message_row.sender_id = actor_id and message_row.client_message_id = client_id;
  if found then
    if result_row.recipient_id <> target_id or result_row.message_text <> btrim(body)
      then raise exception 'FRIEND_MESSAGE_ID_CONFLICT'; end if;
    return result_row;
  end if;
  -- Conservative Free-plan guard. Existing Duels features continue if chat capacity is reached.
  if pg_database_size(current_database()) >= 471859200
    or (select count(*) from public.duel_friend_messages) >= 20000
  then raise exception 'SOCIAL_CHAT_STORAGE_FULL'; end if;
  insert into public.duel_friend_messages as message_row (sender_id, recipient_id, client_message_id, message_text)
    values (actor_id, target_id, client_id, btrim(body)) returning message_row.* into result_row;
  return result_row;
end;
$$;
revoke all on function public.gateway_store_duel_friend_message(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.gateway_store_duel_friend_message(uuid,uuid,text,text) to service_role;

create or replace function public.gateway_get_duel_friend_messages(
  actor_id uuid, target_id uuid, before_seq bigint default null
) returns setof public.duel_friend_messages language sql stable security definer set search_path = '' as $$
  select message_row.* from public.duel_friend_messages as message_row
  where least(message_row.sender_id, message_row.recipient_id) = least(actor_id, target_id)
    and greatest(message_row.sender_id, message_row.recipient_id) = greatest(actor_id, target_id)
    and message_row.created_at >= now() - interval '24 hours'
    and (before_seq is null or message_row.message_sequence < before_seq)
    and exists (select 1 from public.duel_friendships as friendship
      where friendship.account_low = least(actor_id, target_id) and friendship.account_high = greatest(actor_id, target_id))
    and not exists (select 1 from public.duel_social_blocks as block_row
      where (block_row.blocker_id = actor_id and block_row.blocked_id = target_id)
         or (block_row.blocker_id = target_id and block_row.blocked_id = actor_id))
  order by message_row.message_sequence desc limit 201;
$$;
revoke all on function public.gateway_get_duel_friend_messages(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.gateway_get_duel_friend_messages(uuid,uuid,bigint) to service_role;

create or replace function public.gateway_duel_friend_chat_inbox(actor_id uuid)
returns table (friend_id uuid, unread_count bigint) language sql stable security definer set search_path = '' as $$
  select message_row.sender_id, count(*) from public.duel_friend_messages as message_row
  join public.duel_friendships as friendship
    on friendship.account_low = least(actor_id, message_row.sender_id)
    and friendship.account_high = greatest(actor_id, message_row.sender_id)
  where message_row.recipient_id = actor_id and message_row.read_at is null
    and message_row.created_at >= now() - interval '24 hours'
    and not exists (select 1 from public.duel_social_blocks as block_row
      where (block_row.blocker_id = actor_id and block_row.blocked_id = message_row.sender_id)
         or (block_row.blocker_id = message_row.sender_id and block_row.blocked_id = actor_id))
  group by message_row.sender_id limit 500;
$$;
revoke all on function public.gateway_duel_friend_chat_inbox(uuid) from public, anon, authenticated;
grant execute on function public.gateway_duel_friend_chat_inbox(uuid) to service_role;

create or replace function public.gateway_social_contract_version()
returns integer language sql stable security invoker set search_path = '' as $$ select 17; $$;
revoke all on function public.gateway_social_contract_version() from public, anon, authenticated;
grant execute on function public.gateway_social_contract_version() to service_role;

-- If Cron is enabled, expired data is also removed while the Gateway is offline.
-- The Gateway runs the same cleanup on connect and every five minutes.
do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('skribbl-duels-friend-chat-cleanup', '*/5 * * * *',
      'select public.gateway_purge_duel_friend_messages(); delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname = ''skribbl-duels-friend-chat-cleanup'') and end_time < now() - interval ''7 days'';');
  end if;
end;
$schedule$;

commit;
