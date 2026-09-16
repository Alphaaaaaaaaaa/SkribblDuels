create table if not exists public.skribbl_coin_accounts (
  -- Deliberately not a foreign key to auth.users: authenticated identity data
  -- may be deleted without destroying or mutating the append-only audit log.
  account_id uuid primary key,
  balance integer not null default 0 check (balance >= 0),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.skribbl_coin_transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  account_id uuid not null references public.skribbl_coin_accounts(account_id) on delete restrict,
  amount integer not null check (amount <> 0),
  entry_kind text not null check (entry_kind in ('earn', 'sink', 'reversal')),
  source_sink_type text not null check (char_length(source_sink_type) between 1 and 64),
  source_entity_id text not null check (char_length(source_entity_id) between 1 and 256),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  rules_version integer not null check (rules_version > 0),
  occurred_at timestamptz not null,
  reversal_of_transaction_id uuid null references public.skribbl_coin_transactions(transaction_id),
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create unique index if not exists skribbl_coin_one_reversal_per_transaction
  on public.skribbl_coin_transactions(reversal_of_transaction_id)
  where reversal_of_transaction_id is not null;

create index if not exists skribbl_coin_transactions_account_time
  on public.skribbl_coin_transactions(account_id, occurred_at desc);

create or replace function public.reject_skribbl_coin_transaction_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Skribbl Coin transactions are append-only; use a reversal transaction.';
end;
$$;

drop trigger if exists skribbl_coin_transactions_append_only on public.skribbl_coin_transactions;
create trigger skribbl_coin_transactions_append_only
before update or delete on public.skribbl_coin_transactions
for each row execute function public.reject_skribbl_coin_transaction_mutation();

create table if not exists public.skribble_daily_words (
  date_key date not null,
  language_id smallint not null check (language_id between 0 and 27),
  language_name text not null,
  word text not null check (char_length(word) > 0),
  wordlist_hash text not null,
  selected_at timestamptz not null default now(),
  primary key (date_key, language_id)
);

create table if not exists public.skribble_daily_runs (
  account_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  language_id smallint not null check (language_id between 0 and 27),
  attempts jsonb not null default '[]'::jsonb check (jsonb_typeof(attempts) = 'array'),
  request_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(request_ids) = 'array'),
  status text not null default 'playing' check (status in ('playing', 'solved', 'lost')),
  reward_amount integer not null default 0 check (reward_amount between 0 and 25),
  rewarded_transaction_id uuid null references public.skribbl_coin_transactions(transaction_id),
  updated_at timestamptz not null default now(),
  primary key (account_id, date_key, language_id)
);

alter table public.skribbl_coin_accounts enable row level security;
alter table public.skribbl_coin_transactions enable row level security;
alter table public.skribble_daily_words enable row level security;
alter table public.skribble_daily_runs enable row level security;

revoke all on public.skribbl_coin_accounts from public, anon, authenticated;
revoke all on public.skribbl_coin_transactions from public, anon, authenticated;
revoke all on public.skribble_daily_words from public, anon, authenticated;
revoke all on public.skribble_daily_runs from public, anon, authenticated;

create or replace function public.apply_skribbl_coin_transaction(
  p_account_id uuid,
  p_idempotency_key text,
  p_amount integer,
  p_entry_kind text,
  p_source_sink_type text,
  p_source_entity_id text,
  p_rules_version integer,
  p_occurred_at timestamptz,
  p_reversal_of_transaction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.skribbl_coin_transactions%rowtype;
  v_original public.skribbl_coin_transactions%rowtype;
  v_account public.skribbl_coin_accounts%rowtype;
  v_transaction public.skribbl_coin_transactions%rowtype;
begin
  if p_amount = 0 or p_rules_version <= 0 or char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'Invalid Skribbl Coin transaction.';
  end if;
  if p_entry_kind not in ('earn', 'sink', 'reversal')
      or (p_entry_kind = 'earn' and p_amount < 0)
      or (p_entry_kind = 'sink' and p_amount > 0) then
    raise exception 'Invalid Skribbl Coin entry kind or amount direction.';
  end if;

  select * into v_existing
  from public.skribbl_coin_transactions
  where account_id = p_account_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.amount <> p_amount
        or v_existing.entry_kind <> p_entry_kind
        or v_existing.source_sink_type <> p_source_sink_type
        or v_existing.source_entity_id <> p_source_entity_id
        or v_existing.rules_version <> p_rules_version
        or v_existing.reversal_of_transaction_id is distinct from p_reversal_of_transaction_id then
      raise exception 'Skribbl Coin idempotency key was reused with a different transaction.';
    end if;
    return to_jsonb(v_existing);
  end if;

  insert into public.skribbl_coin_accounts(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  select * into v_account
  from public.skribbl_coin_accounts
  where account_id = p_account_id
  for update;

  -- The first lookup is a fast retry path. This second lookup is required
  -- under the account row lock so two simultaneous calls with the same key
  -- cannot race into a unique-constraint failure or duplicate a balance move.
  select * into v_existing
  from public.skribbl_coin_transactions
  where account_id = p_account_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.amount <> p_amount
        or v_existing.entry_kind <> p_entry_kind
        or v_existing.source_sink_type <> p_source_sink_type
        or v_existing.source_entity_id <> p_source_entity_id
        or v_existing.rules_version <> p_rules_version
        or v_existing.reversal_of_transaction_id is distinct from p_reversal_of_transaction_id then
      raise exception 'Skribbl Coin idempotency key was reused with a different transaction.';
    end if;
    return to_jsonb(v_existing);
  end if;

  if p_reversal_of_transaction_id is not null then
    select * into v_original
    from public.skribbl_coin_transactions
    where transaction_id = p_reversal_of_transaction_id
    for update;
    if not found or v_original.account_id <> p_account_id or p_amount <> -v_original.amount
        or p_entry_kind <> 'reversal' then
      raise exception 'Invalid Skribbl Coin reversal.';
    end if;
  elsif p_entry_kind = 'reversal' then
    raise exception 'A reversal must identify its original transaction.';
  end if;

  if v_account.balance + p_amount < 0 then
    raise exception 'Insufficient Skribbl Coins.';
  end if;

  insert into public.skribbl_coin_transactions(
    account_id, idempotency_key, amount, entry_kind, source_sink_type,
    source_entity_id, balance_before, balance_after, rules_version,
    occurred_at, reversal_of_transaction_id
  ) values (
    p_account_id, p_idempotency_key, p_amount, p_entry_kind, p_source_sink_type,
    p_source_entity_id, v_account.balance, v_account.balance + p_amount,
    p_rules_version, p_occurred_at, p_reversal_of_transaction_id
  ) returning * into v_transaction;

  update public.skribbl_coin_accounts
  set balance = v_transaction.balance_after,
      revision = revision + 1,
      updated_at = now()
  where account_id = p_account_id;

  return to_jsonb(v_transaction);
end;
$$;

revoke all on function public.apply_skribbl_coin_transaction(
  uuid, text, integer, text, text, text, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.apply_skribbl_coin_transaction(
  uuid, text, integer, text, text, text, integer, timestamptz, uuid
) to service_role;
