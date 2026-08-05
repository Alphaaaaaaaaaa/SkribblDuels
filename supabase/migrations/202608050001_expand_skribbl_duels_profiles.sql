begin;

alter table public.profiles
  add column if not exists preferred_language text not null default 'en',
  add column if not exists avatar_source text not null default 'discord',
  add column if not exists skribbl_avatar smallint[],
  add column if not exists special_avatar_id text;

update public.profiles
set display_name = left(case when char_length(btrim(display_name)) >= 3
  then btrim(display_name) else username || ' user' end, 24);

with duplicate_names as (
  select id, row_number() over (partition by lower(display_name) order by created_at, id) as duplicate_number
  from public.profiles
)
update public.profiles as profile
set display_name = left(profile.display_name, 15) || '-' || left(profile.id::text, 8)
from duplicate_names
where profile.id = duplicate_names.id and duplicate_names.duplicate_number > 1;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length
  check (char_length(display_name) between 3 and 24);
alter table public.profiles add constraint profiles_preferred_language
  check (preferred_language in ('de', 'en'));
alter table public.profiles add constraint profiles_avatar_source
  check (avatar_source in ('discord', 'skribbl'));
alter table public.profiles add constraint profiles_skribbl_avatar
  check (
    skribbl_avatar is null or (
      cardinality(skribbl_avatar) = 4
      and skribbl_avatar[1] between 0 and 255
      and skribbl_avatar[2] between 0 and 255
      and skribbl_avatar[3] between 0 and 255
      and skribbl_avatar[4] between -1 and 255
    )
  );

create unique index if not exists profiles_display_name_unique_ci
  on public.profiles (lower(display_name));

create table if not exists public.avatar_special_entitlements (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  special_avatar_id text not null,
  granted_at timestamptz not null default timezone('utc'::text, now()),
  primary key (profile_id, special_avatar_id),
  constraint avatar_special_id_format check (special_avatar_id ~ '^[a-z0-9-]{1,64}$')
);

alter table public.avatar_special_entitlements enable row level security;
revoke all on table public.avatar_special_entitlements from anon, authenticated;
grant select on table public.avatar_special_entitlements to authenticated;
grant all on table public.avatar_special_entitlements to service_role;
drop policy if exists own_avatar_special_entitlements on public.avatar_special_entitlements;
create policy own_avatar_special_entitlements on public.avatar_special_entitlements
  for select to authenticated using ((select auth.uid()) = profile_id);

-- OAuth refreshes update Discord-owned fields without overwriting the user's Duel name.
create or replace function public.sync_skribbl_duels_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  profile_username text;
  profile_display_name text;
begin
  profile_username := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'Discord user'), 64);
  profile_display_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), profile_username), 24);
  if char_length(profile_display_name) < 3 then profile_display_name := left(profile_username || ' user', 24); end if;

  insert into public.profiles (id, discord_id, username, display_name, avatar_url)
  values (
    new.id,
    case when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'discord'
      then nullif(btrim(coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub')), '') end,
    profile_username,
    profile_display_name,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')), ''), 2048)
  )
  on conflict (id) do update set
    discord_id = excluded.discord_id,
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.update_skribbl_duels_profile(
  duel_display_name text,
  duel_preferred_language text,
  duel_avatar_source text,
  duel_skribbl_avatar smallint[] default null,
  duel_special_avatar_id text default null
) returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if duel_special_avatar_id is not null and not exists (
    select 1 from public.avatar_special_entitlements
    where profile_id = auth.uid() and special_avatar_id = duel_special_avatar_id
  ) then raise exception 'Special avatar is not entitled'; end if;

  update public.profiles set
    display_name = btrim(duel_display_name),
    preferred_language = duel_preferred_language,
    avatar_source = duel_avatar_source,
    skribbl_avatar = case when duel_avatar_source = 'skribbl' then duel_skribbl_avatar else null end,
    special_avatar_id = case when duel_avatar_source = 'skribbl' then duel_special_avatar_id else null end,
    updated_at = timezone('utc'::text, now())
  where id = auth.uid()
  returning * into updated_profile;
  return updated_profile;
end;
$$;

revoke all on function public.update_skribbl_duels_profile(text,text,text,smallint[],text) from public, anon;
grant execute on function public.update_skribbl_duels_profile(text,text,text,smallint[],text) to authenticated;

commit;
