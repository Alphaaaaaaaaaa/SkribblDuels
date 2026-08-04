begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text unique,
  username text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint profiles_username_length check (char_length(username) between 1 and 64),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 128),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 2048
  )
);

comment on table public.profiles is
  'Public Skribbl Duels identity derived from trusted Supabase Auth metadata.';
comment on column public.profiles.id is
  'Stable Supabase Auth user ID and future authoritative Gateway identity.';
comment on column public.profiles.discord_id is
  'Discord provider user ID. Null only for a non-Discord Auth user.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

drop policy if exists skribbl_duels_profiles_select_authenticated
  on public.profiles;
create policy skribbl_duels_profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (true);

create or replace function public.sync_skribbl_duels_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_discord_id text;
  profile_username text;
  profile_display_name text;
  profile_avatar_url text;
begin
  profile_discord_id := case
    when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'discord'
      then nullif(btrim(coalesce(
        new.raw_user_meta_data ->> 'provider_id',
        new.raw_user_meta_data ->> 'sub',
        new.raw_user_meta_data ->> 'discord_id'
      )), '')
    else null
  end;

  profile_username := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    'Discord user'
  ), 64);

  profile_display_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    profile_username
  ), 128);

  profile_avatar_url := left(nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  )), ''), 2048);

  insert into public.profiles (
    id,
    discord_id,
    username,
    display_name,
    avatar_url
  ) values (
    new.id,
    profile_discord_id,
    profile_username,
    profile_display_name,
    profile_avatar_url
  )
  on conflict (id) do update set
    discord_id = excluded.discord_id,
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = timezone('utc'::text, now())
  where public.profiles.discord_id is distinct from excluded.discord_id
    or public.profiles.username is distinct from excluded.username
    or public.profiles.display_name is distinct from excluded.display_name
    or public.profiles.avatar_url is distinct from excluded.avatar_url;

  return new;
end;
$$;

revoke all on function public.sync_skribbl_duels_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_sync_skribbl_duels_profile on auth.users;
create trigger on_auth_user_sync_skribbl_duels_profile
  after insert or update of raw_user_meta_data, raw_app_meta_data
  on auth.users
  for each row execute function public.sync_skribbl_duels_profile();

insert into public.profiles (
  id,
  discord_id,
  username,
  display_name,
  avatar_url
)
select
  auth_user.id,
  case
    when coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'discord'
      then nullif(btrim(coalesce(
        auth_user.raw_user_meta_data ->> 'provider_id',
        auth_user.raw_user_meta_data ->> 'sub',
        auth_user.raw_user_meta_data ->> 'discord_id'
      )), '')
    else null
  end,
  left(coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
    'Discord user'
  ), 64),
  left(coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'user_name'), ''),
    'Discord user'
  ), 128),
  left(nullif(btrim(coalesce(
    auth_user.raw_user_meta_data ->> 'avatar_url',
    auth_user.raw_user_meta_data ->> 'picture'
  )), ''), 2048)
from auth.users as auth_user
on conflict (id) do update set
  discord_id = excluded.discord_id,
  username = excluded.username,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  updated_at = timezone('utc'::text, now());

commit;
