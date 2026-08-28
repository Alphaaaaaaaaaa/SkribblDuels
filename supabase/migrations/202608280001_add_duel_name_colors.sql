begin;

alter table public.profiles
  add column if not exists name_color_index smallint not null default 26;

alter table public.profiles
  drop constraint if exists profiles_name_color_index;
alter table public.profiles
  add constraint profiles_name_color_index
  check (name_color_index between 0 and 27);

drop function if exists public.update_skribbl_duels_profile(text,text,text,smallint[],text);

create or replace function public.update_skribbl_duels_profile(
  duel_display_name text,
  duel_preferred_language text,
  duel_avatar_source text,
  duel_skribbl_avatar smallint[] default null,
  duel_special_avatar_id text default null,
  duel_name_color_index smallint default 26
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
  if duel_name_color_index not between 0 and 27 then raise exception 'Unsupported Duel name color'; end if;
  if duel_avatar_source = 'skribbl' and duel_skribbl_avatar is null then
    raise exception 'A Skribbl avatar is required';
  end if;
  if duel_avatar_source = 'skribbl'
    and exists (
      select 1 from unnest(duel_skribbl_avatar) as avatar_part(value)
      where avatar_part.value < -1
    )
    and not exists (
      select 1 from public.avatar_invisible_entitlements
      where profile_id = auth.uid()
    ) then
    raise exception 'Invisible avatar parts are not entitled';
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
    name_color_index = duel_name_color_index,
    updated_at = timezone('utc'::text, now())
  where id = auth.uid()
  returning * into updated_profile;
  return updated_profile;
end;
$$;

revoke all on function public.update_skribbl_duels_profile(text,text,text,smallint[],text,smallint) from public, anon;
grant execute on function public.update_skribbl_duels_profile(text,text,text,smallint[],text,smallint) to authenticated;

commit;
