begin;

alter table public.skribbl_slot_spins
  drop constraint if exists skribbl_slot_spins_coin_reward_check;
alter table public.skribbl_slot_spins
  add constraint skribbl_slot_spins_coin_reward_check
  check (coin_reward between 0 and 100);

create or replace function public.apply_skribbl_slot_spin(
  p_account_id uuid,
  p_request_id text,
  p_spin_id uuid,
  p_initial_icons text[],
  p_effect_steps jsonb,
  p_final_icons text[],
  p_coin_reward integer,
  p_base_free_spin_reward integer,
  p_heart_count integer,
  p_rules_version integer,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_icons constant text[] := array[
    'book','slimy','fill','wizard','eraser','trash','dice','heart',
    'skribbl-coin','7','trophy','crown','pen','skribbl-duels-logo',
    'potion','drop','pizza','pumpkin','eggplant','pineapple','peach',
    'ribbon','skull','poop'
  ];
  v_existing public.skribbl_slot_spins%rowtype;
  v_slot public.skribbl_slot_accounts%rowtype;
  v_coin public.skribbl_coin_accounts%rowtype;
  v_spin public.skribbl_slot_spins%rowtype;
  v_cost jsonb := null;
  v_reward jsonb := null;
  v_expected_coin_reward integer := 0;
  v_expected_base_free_spins integer := 0;
  v_expected_hearts integer := 0;
  v_used_free_spin boolean;
  v_used_free_spin_source text;
  v_base_free_spin_source text;
  v_next_free_spin_source text;
  v_coin_cost integer;
  v_heart_total integer;
  v_heart_free_spins integer;
  v_awarded_free_spins integer;
begin
  if char_length(p_request_id) not between 1 and 200
      or p_rules_version is null
      or p_rules_version not in (1, 2)
      or cardinality(p_initial_icons) <> 3
      or cardinality(p_final_icons) <> 3
      or jsonb_typeof(p_effect_steps) <> 'array'
      or exists (select 1 from unnest(p_initial_icons || p_final_icons) icon where not (icon = any(v_allowed_icons))) then
    raise exception 'Invalid Skribbl Slots spin payload.';
  end if;

  if p_final_icons[1] = p_final_icons[2] and p_final_icons[2] = p_final_icons[3] then
    if p_rules_version = 1 then
      v_expected_coin_reward := case p_final_icons[1]
        when 'skribbl-coin' then 10 when '7' then 7
        when 'trophy' then 5 when 'crown' then 5
        when 'pen' then 4 when 'skribbl-duels-logo' then 4
        when 'potion' then 3 when 'drop' then 3
        when 'pizza' then 2 when 'pumpkin' then 2 when 'eggplant' then 2
        when 'pineapple' then 1 when 'peach' then 1 when 'ribbon' then 1
        else 0 end;
    else
      v_expected_coin_reward := case p_final_icons[1]
        when 'skribbl-coin' then 100 when '7' then 77
        when 'trophy' then 50 when 'crown' then 50
        when 'pen' then 40 when 'skribbl-duels-logo' then 40
        when 'potion' then 30 when 'drop' then 30
        when 'pizza' then 20 when 'pumpkin' then 20 when 'eggplant' then 20
        when 'pineapple' then 10 when 'peach' then 10 when 'ribbon' then 10
        else 0 end;
    end if;
    v_expected_base_free_spins := case p_final_icons[1]
      when 'book' then 5 when 'slimy' then 10 else 0 end;
  end if;
  select count(*)::integer into v_expected_hearts
  from unnest(p_final_icons) icon where icon = 'heart';
  if p_coin_reward <> v_expected_coin_reward
      or p_base_free_spin_reward <> v_expected_base_free_spins
      or p_heart_count <> v_expected_hearts then
    raise exception 'Skribbl Slots reward does not match the final payline.';
  end if;

  insert into public.skribbl_coin_accounts(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;
  select * into v_coin from public.skribbl_coin_accounts
  where account_id = p_account_id for update;

  insert into public.skribbl_slot_accounts(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;
  select * into v_slot from public.skribbl_slot_accounts
  where account_id = p_account_id for update;

  select * into v_existing from public.skribbl_slot_spins
  where account_id = p_account_id and request_id = p_request_id;
  if found then return to_jsonb(v_existing); end if;

  v_used_free_spin_source := case
    when v_slot.heart_free_spins > 0 then 'heart'
    when v_slot.book_free_spins > 0 then 'book'
    when v_slot.slimy_free_spins > 0 then 'slimy'
    else null
  end;
  v_used_free_spin := v_used_free_spin_source is not null;
  v_coin_cost := case when v_used_free_spin then 0 else 1 end;
  if not v_used_free_spin and v_coin.balance < 1 then
    raise exception 'SCD_SLOTS_INSUFFICIENT_COINS';
  end if;

  if v_coin_cost = 1 then
    v_cost := public.apply_skribbl_coin_transaction(
      p_account_id,
      'slots:cost:' || p_account_id::text || ':' || p_request_id,
      -1,
      'sink',
      'skribbl-slots-spin',
      p_spin_id::text,
      p_rules_version,
      p_occurred_at,
      null
    );
  end if;
  if p_coin_reward > 0 then
    v_reward := public.apply_skribbl_coin_transaction(
      p_account_id,
      'slots:reward:' || p_account_id::text || ':' || p_request_id,
      p_coin_reward,
      'earn',
      'skribbl-slots-payline',
      p_spin_id::text,
      p_rules_version,
      p_occurred_at,
      null
    );
  end if;

  v_heart_total := v_slot.heart_progress + p_heart_count;
  v_heart_free_spins := floor(v_heart_total / 3.0)::integer;
  v_awarded_free_spins := p_base_free_spin_reward + v_heart_free_spins;
  v_base_free_spin_source := case when p_base_free_spin_reward > 0 then p_final_icons[1] else null end;

  update public.skribbl_slot_accounts
  set free_spins = free_spins - case when v_used_free_spin then 1 else 0 end + v_awarded_free_spins,
      book_free_spins = book_free_spins
        - case when v_used_free_spin_source = 'book' then 1 else 0 end
        + case when v_base_free_spin_source = 'book' then p_base_free_spin_reward else 0 end,
      slimy_free_spins = slimy_free_spins
        - case when v_used_free_spin_source = 'slimy' then 1 else 0 end
        + case when v_base_free_spin_source = 'slimy' then p_base_free_spin_reward else 0 end,
      heart_free_spins = heart_free_spins
        - case when v_used_free_spin_source = 'heart' then 1 else 0 end
        + v_heart_free_spins,
      heart_progress = mod(v_heart_total, 3),
      revision = revision + 1,
      updated_at = now()
  where account_id = p_account_id
  returning * into v_slot;

  v_next_free_spin_source := case
    when v_slot.heart_free_spins > 0 then 'heart'
    when v_slot.book_free_spins > 0 then 'book'
    when v_slot.slimy_free_spins > 0 then 'slimy'
    else null
  end;

  select * into v_coin from public.skribbl_coin_accounts
  where account_id = p_account_id;

  insert into public.skribbl_slot_spins(
    spin_id, request_id, account_id, initial_icons, effect_steps, final_icons,
    used_free_spin, used_free_spin_source, coin_cost, coin_reward, awarded_free_spins,
    free_spins_before, free_spins_after, next_free_spin_source, heart_progress_before,
    heart_progress_after, balance_before, balance_after, coin_revision,
    cost_transaction_id, reward_transaction_id, rules_version, occurred_at
  ) values (
    p_spin_id, p_request_id, p_account_id, p_initial_icons, p_effect_steps, p_final_icons,
    v_used_free_spin, v_used_free_spin_source, v_coin_cost, p_coin_reward, v_awarded_free_spins,
    v_slot.free_spins + case when v_used_free_spin then 1 else 0 end - v_awarded_free_spins,
    v_slot.free_spins, v_next_free_spin_source, mod(v_heart_total - p_heart_count, 3), v_slot.heart_progress,
    v_coin.balance - p_coin_reward + v_coin_cost, v_coin.balance, v_coin.revision,
    case when v_cost is null then null else (v_cost ->> 'transaction_id')::uuid end,
    case when v_reward is null then null else (v_reward ->> 'transaction_id')::uuid end,
    p_rules_version, p_occurred_at
  ) returning * into v_spin;

  return to_jsonb(v_spin);
end;
$$;

revoke all on function public.apply_skribbl_slot_spin(
  uuid,text,uuid,text[],jsonb,text[],integer,integer,integer,integer,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_skribbl_slot_spin(
  uuid,text,uuid,text[],jsonb,text[],integer,integer,integer,integer,timestamptz
) to service_role;

commit;
