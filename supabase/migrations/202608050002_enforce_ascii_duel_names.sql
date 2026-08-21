begin;

-- Previously accepted Unicode, spaces and punctuation are replaced with a
-- deterministic account-specific fallback before the stricter constraint is
-- installed. The UUID-derived suffix keeps the case-insensitive unique index
-- collision-free.
update public.profiles
set display_name = 'User' || left(replace(id::text, '-', ''), 20),
    updated_at = timezone('utc'::text, now())
where display_name !~ '^[A-Za-z0-9]{3,24}$';

alter table public.profiles
  drop constraint if exists profiles_display_name_ascii_alphanumeric;
alter table public.profiles
  add constraint profiles_display_name_ascii_alphanumeric
  check (display_name ~ '^[A-Za-z0-9]{3,24}$');

-- New Discord accounts receive an ASCII-safe Duel name. OAuth refreshes still
-- update only Discord-owned fields and never overwrite a chosen Duel name.
create or replace function public.sync_skribbl_duels_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  profile_username text;
  profile_display_name text;
begin
  profile_username := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    'Discord user'
  ), 64);
  profile_display_name := left(regexp_replace(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    profile_username
  ), '[^A-Za-z0-9]', '', 'g'), 24);
  if char_length(profile_display_name) < 3 or exists (
    select 1 from public.profiles
    where lower(display_name) = lower(profile_display_name) and id <> new.id
  ) then
    profile_display_name := 'User' || left(replace(new.id::text, '-', ''), 20);
  end if;

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
  if duel_display_name !~ '^[A-Za-z0-9]{3,24}$' then
    raise exception 'Duel display name may contain only A-Z, a-z and 0-9 and must be 3 to 24 characters long';
  end if;
  if duel_preferred_language not in ('de', 'en') then raise exception 'Unsupported language'; end if;
  if duel_avatar_source not in ('discord', 'skribbl') then raise exception 'Unsupported avatar source'; end if;
  if duel_avatar_source = 'skribbl' and duel_skribbl_avatar is null then
    raise exception 'A Skribbl avatar is required';
  end if;
  if duel_avatar_source = 'skribbl'
    and duel_skribbl_avatar[4] >= 0
    and (duel_special_avatar_id is null or not exists (
      select 1 from public.avatar_special_entitlements
      where profile_id = auth.uid() and special_avatar_id = duel_special_avatar_id
    )) then
    raise exception 'Special avatar is not entitled';
  end if;

  update public.profiles set
    display_name = duel_display_name,
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
