begin;

-- Run this file in the Supabase SQL editor after both profile migrations.
-- The entitlement id is an opaque server-owned permission. The visible
-- Special sprite still comes from the fourth value of the user's current
-- Skribbl avatar stored by the profile editor.
do $$
declare
  target_profile_id constant uuid := 'c27ea4b9-984e-4efb-bfba-e9f77b28f1f4';
  target_special_avatar_id constant text := 'analphabetism-special';
begin
  if not exists (
    select 1 from public.profiles where id = target_profile_id
  ) then
    raise exception 'Skribbl Duels profile % was not found', target_profile_id;
  end if;

  insert into public.avatar_special_entitlements (
    profile_id,
    special_avatar_id
  ) values (
    target_profile_id,
    target_special_avatar_id
  )
  on conflict (profile_id, special_avatar_id) do nothing;

  update public.profiles
  set special_avatar_id = target_special_avatar_id,
      updated_at = timezone('utc'::text, now())
  where id = target_profile_id;
end;
$$;

commit;

select
  profile.id,
  profile.username,
  profile.display_name,
  profile.special_avatar_id,
  entitlement.granted_at
from public.profiles as profile
join public.avatar_special_entitlements as entitlement
  on entitlement.profile_id = profile.id
 and entitlement.special_avatar_id = profile.special_avatar_id
where profile.id = 'c27ea4b9-984e-4efb-bfba-e9f77b28f1f4';
