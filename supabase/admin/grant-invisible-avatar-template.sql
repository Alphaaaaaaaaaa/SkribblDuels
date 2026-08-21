begin;

-- Replace the zero UUID below with the new Skribbl Duels profile UUID before
-- running this owner-only helper in the Supabase SQL editor.
create temporary table invisible_avatar_grant_target (
  profile_id uuid primary key
) on commit drop;

insert into invisible_avatar_grant_target (profile_id)
values ('00000000-0000-0000-0000-000000000000');

do $$
declare
  target_profile_id uuid;
begin
  select profile_id into strict target_profile_id
  from pg_temp.invisible_avatar_grant_target;
  if target_profile_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace target_profile_id with the intended profile UUID';
  end if;
  if not exists (select 1 from public.profiles where id = target_profile_id) then
    raise exception 'Skribbl Duels profile % was not found', target_profile_id;
  end if;

  insert into public.avatar_invisible_entitlements (profile_id)
  values (target_profile_id)
  on conflict (profile_id) do nothing;
end;
$$;

select
  profile.id,
  profile.username,
  profile.display_name,
  entitlement.granted_at
from public.profiles as profile
join public.avatar_invisible_entitlements as entitlement
  on entitlement.profile_id = profile.id
join pg_temp.invisible_avatar_grant_target as target
  on target.profile_id = profile.id;

commit;
