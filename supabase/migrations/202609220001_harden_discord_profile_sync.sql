begin;

-- Discord usernames are provider-owned labels and may contain underscores or
-- other punctuation. Duel display names remain ASCII-alphanumeric, so account
-- provisioning derives a safe candidate and falls back to the Auth UUID.
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
  if profile_discord_id is not null and exists (
    select 1 from public.profiles
    where discord_id = profile_discord_id and id <> new.id
  ) then
    -- A stale duplicate provider link must not abort the OAuth transaction.
    profile_discord_id := null;
  end if;

  profile_username := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    'Discord user'
  ), 64);
  profile_display_name := left(regexp_replace(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    profile_username
  ), '[^A-Za-z0-9]', '', 'g'), 24);
  if char_length(profile_display_name) < 3 or exists (
    select 1 from public.profiles
    where lower(display_name) = lower(profile_display_name) and id <> new.id
  ) then
    profile_display_name := 'User' || left(replace(new.id::text, '-', ''), 20);
  end if;

  profile_avatar_url := left(nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  )), ''), 2048);

  insert into public.profiles (id, discord_id, username, display_name, avatar_url)
  values (
    new.id,
    profile_discord_id,
    profile_username,
    profile_display_name,
    profile_avatar_url
  )
  on conflict (id) do update set
    discord_id = excluded.discord_id,
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

revoke all on function public.sync_skribbl_duels_profile()
  from public, anon, authenticated;

-- Repair Auth accounts created during a failed/partial historical profile
-- trigger. UUID-derived names make this backfill independent of provider text.
insert into public.profiles (id, discord_id, username, display_name, avatar_url)
select
  auth_user.id,
  case
    when coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'discord'
      and not exists (
        select 1 from public.profiles existing
        where existing.discord_id = nullif(btrim(coalesce(
          auth_user.raw_user_meta_data ->> 'provider_id',
          auth_user.raw_user_meta_data ->> 'sub',
          auth_user.raw_user_meta_data ->> 'discord_id'
        )), '')
      )
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
  'User' || left(replace(auth_user.id::text, '-', ''), 20),
  left(nullif(btrim(coalesce(
    auth_user.raw_user_meta_data ->> 'avatar_url',
    auth_user.raw_user_meta_data ->> 'picture'
  )), ''), 2048)
from auth.users auth_user
where not exists (
  select 1 from public.profiles profile where profile.id = auth_user.id
)
on conflict (id) do nothing;

commit;
