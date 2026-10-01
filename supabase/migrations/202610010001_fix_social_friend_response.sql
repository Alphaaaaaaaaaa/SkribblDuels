begin;

-- Contract v16: qualify every duel_friend_requests reference.  The v15
-- function returned a column named recipient_id, which also became a PL/pgSQL
-- output variable and made the unqualified WHERE clause ambiguous at runtime.
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

  select request_row.* into target
  from public.duel_friend_requests as request_row
  where request_row.request_id = target_request_id
    and request_row.recipient_id = actor_id
    and request_row.status in ('pending', 'ignored')
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
    delete from public.duel_friendships as friendship
    where friendship.account_low = pair_low and friendship.account_high = pair_high;
    delete from public.duel_friend_pins as pin
    where (pin.owner_id = actor_id and pin.friend_id = target.sender_id)
       or (pin.owner_id = target.sender_id and pin.friend_id = actor_id);
  end if;

  update public.duel_friend_requests as request_row
  set status = next_status,
      responded_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where request_row.request_id = target_request_id;

  return query select target.sender_id, target.recipient_id, next_status, target.created_at;
end;
$$;
revoke all on function public.gateway_respond_duel_friend_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.gateway_respond_duel_friend_request(uuid,uuid,text) to service_role;

-- A scalar contract probe lets /readyz reject a Gateway deployment whose
-- database has not received this hotfix yet.
create or replace function public.gateway_social_contract_version()
returns integer language sql stable security invoker set search_path = '' as $$
  select 16;
$$;
revoke all on function public.gateway_social_contract_version() from public, anon, authenticated;
grant execute on function public.gateway_social_contract_version() to service_role;

commit;
