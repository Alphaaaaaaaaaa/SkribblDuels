begin;

-- Supabase lint 0011: trigger helpers do not need any ambient search path.
alter function public.reject_skribbl_coin_transaction_mutation() set search_path = '';

create table if not exists public.skribbl_slot_accounts (
  account_id uuid primary key references public.skribbl_coin_accounts(account_id) on delete restrict,
  free_spins integer not null default 0 check (free_spins between 0 and 10000),
  book_free_spins integer not null default 0 check (book_free_spins between 0 and 10000),
  slimy_free_spins integer not null default 0 check (slimy_free_spins between 0 and 10000),
  heart_free_spins integer not null default 0 check (heart_free_spins between 0 and 10000),
  heart_progress smallint not null default 0 check (heart_progress between 0 and 2),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  check (free_spins = book_free_spins + slimy_free_spins + heart_free_spins)
);

create table if not exists public.skribbl_slot_spins (
  spin_id uuid primary key,
  request_id text not null check (char_length(request_id) between 1 and 200),
  account_id uuid not null references public.skribbl_slot_accounts(account_id) on delete restrict,
  initial_icons text[] not null check (cardinality(initial_icons) = 3),
  effect_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(effect_steps) = 'array'),
  final_icons text[] not null check (cardinality(final_icons) = 3),
  used_free_spin boolean not null,
  used_free_spin_source text null check (used_free_spin_source is null or used_free_spin_source in ('book', 'slimy', 'heart')),
  coin_cost smallint not null check (coin_cost in (0, 1)),
  coin_reward smallint not null check (coin_reward between 0 and 10),
  awarded_free_spins smallint not null check (awarded_free_spins between 0 and 11),
  free_spins_before integer not null check (free_spins_before between 0 and 10000),
  free_spins_after integer not null check (free_spins_after between 0 and 10000),
  next_free_spin_source text null check (next_free_spin_source is null or next_free_spin_source in ('book', 'slimy', 'heart')),
  heart_progress_before smallint not null check (heart_progress_before between 0 and 2),
  heart_progress_after smallint not null check (heart_progress_after between 0 and 2),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  coin_revision bigint not null check (coin_revision >= 0),
  cost_transaction_id uuid null references public.skribbl_coin_transactions(transaction_id),
  reward_transaction_id uuid null references public.skribbl_coin_transactions(transaction_id),
  rules_version integer not null check (rules_version > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (account_id, request_id)
);

create index if not exists skribbl_slot_spins_account_time
  on public.skribbl_slot_spins(account_id, occurred_at desc);

create or replace function public.reject_skribbl_slot_spin_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Skribbl Slots spins are append-only.';
end;
$$;

drop trigger if exists skribbl_slot_spins_append_only on public.skribbl_slot_spins;
create trigger skribbl_slot_spins_append_only
before update or delete on public.skribbl_slot_spins
for each row execute function public.reject_skribbl_slot_spin_mutation();

alter table public.skribbl_slot_accounts enable row level security;
alter table public.skribbl_slot_spins enable row level security;
revoke all on public.skribbl_slot_accounts from public, anon, authenticated;
revoke all on public.skribbl_slot_spins from public, anon, authenticated;

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
      or p_rules_version <= 0
      or cardinality(p_initial_icons) <> 3
      or cardinality(p_final_icons) <> 3
      or jsonb_typeof(p_effect_steps) <> 'array'
      or exists (select 1 from unnest(p_initial_icons || p_final_icons) icon where not (icon = any(v_allowed_icons))) then
    raise exception 'Invalid Skribbl Slots spin payload.';
  end if;

  if p_final_icons[1] = p_final_icons[2] and p_final_icons[2] = p_final_icons[3] then
    v_expected_coin_reward := case p_final_icons[1]
      when 'skribbl-coin' then 10 when '7' then 7
      when 'trophy' then 5 when 'crown' then 5
      when 'pen' then 4 when 'skribbl-duels-logo' then 4
      when 'potion' then 3 when 'drop' then 3
      when 'pizza' then 2 when 'pumpkin' then 2 when 'eggplant' then 2
      when 'pineapple' then 1 when 'peach' then 1 when 'ribbon' then 1
      else 0 end;
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

-- Supabase lint 0029: profile writes now run as the signed-in role. A row-level
-- policy plus a validating trigger preserve the same entitlement boundary for
-- both RPC and direct PostgREST column updates.
create or replace function public.validate_skribbl_duels_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id <> auth.uid() or old.id <> auth.uid() then raise exception 'Authentication mismatch'; end if;
  if new.display_name !~ '^[A-Za-z0-9]{3,24}$' then
    raise exception 'Duel display name may contain only A-Z, a-z and 0-9 and must be 3 to 24 characters long';
  end if;
  if new.preferred_language not in ('de', 'en') then raise exception 'Unsupported language'; end if;
  if new.avatar_source not in ('discord', 'skribbl') then raise exception 'Unsupported avatar source'; end if;
  if new.name_color_index not between 0 and 27 then raise exception 'Unsupported Duel name color'; end if;
  if new.avatar_source = 'discord' and (new.skribbl_avatar is not null or new.special_avatar_id is not null) then
    raise exception 'Discord avatars cannot carry Skribbl avatar data';
  end if;
  if new.avatar_source = 'skribbl' and new.skribbl_avatar is null then
    raise exception 'A Skribbl avatar is required';
  end if;
  if new.avatar_source = 'skribbl'
    and exists (select 1 from unnest(new.skribbl_avatar) avatar_part(value) where avatar_part.value < -1)
    and not exists (select 1 from public.avatar_invisible_entitlements where profile_id = auth.uid()) then
    raise exception 'Invisible avatar parts are not entitled';
  end if;
  if new.avatar_source = 'skribbl' and new.skribbl_avatar[4] >= 0
    and (new.special_avatar_id is null or not exists (
      select 1 from public.avatar_special_entitlements
      where profile_id = auth.uid() and special_avatar_id = new.special_avatar_id
    )) then
    raise exception 'Special avatar is not entitled';
  end if;
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists validate_skribbl_duels_profile_update on public.profiles;
create trigger validate_skribbl_duels_profile_update
before update of display_name, preferred_language, avatar_source, skribbl_avatar,
  special_avatar_id, name_color_index on public.profiles
for each row execute function public.validate_skribbl_duels_profile_update();

drop policy if exists skribbl_duels_profiles_update_own on public.profiles;
create policy skribbl_duels_profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant update(display_name, preferred_language, avatar_source, skribbl_avatar,
  special_avatar_id, name_color_index) on public.profiles to authenticated;

create or replace function public.update_skribbl_duels_profile(
  duel_display_name text,
  duel_preferred_language text,
  duel_avatar_source text,
  duel_skribbl_avatar smallint[] default null,
  duel_special_avatar_id text default null,
  duel_name_color_index smallint default 26
) returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles set
    display_name = duel_display_name,
    preferred_language = duel_preferred_language,
    avatar_source = duel_avatar_source,
    skribbl_avatar = case when duel_avatar_source = 'skribbl' then duel_skribbl_avatar else null end,
    special_avatar_id = case when duel_avatar_source = 'skribbl' then duel_special_avatar_id else null end,
    name_color_index = duel_name_color_index
  where id = auth.uid()
  returning * into updated_profile;
  return updated_profile;
end;
$$;

revoke all on function public.update_skribbl_duels_profile(
  text,text,text,smallint[],text,smallint
) from public, anon;
grant execute on function public.update_skribbl_duels_profile(
  text,text,text,smallint[],text,smallint
) to authenticated;

commit;
