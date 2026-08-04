select
  to_regclass('public.profiles') is not null as profiles_table_exists,
  coalesce((
    select table_info.relrowsecurity
    from pg_catalog.pg_class as table_info
    join pg_catalog.pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    where schema_info.nspname = 'public'
      and table_info.relname = 'profiles'
  ), false) as rls_enabled,
  has_table_privilege('anon', 'public.profiles', 'select') as anon_can_read,
  has_table_privilege('authenticated', 'public.profiles', 'select') as authenticated_can_read,
  has_table_privilege('authenticated', 'public.profiles', 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.profiles', 'update') as authenticated_can_update,
  has_table_privilege('authenticated', 'public.profiles', 'delete') as authenticated_can_delete,
  (select count(*) from auth.users) as auth_user_count,
  (select count(*) from public.profiles) as profile_count,
  coalesce((
    select jsonb_agg(to_jsonb(recent_profile) order by recent_profile.created_at desc)
    from (
      select
        id,
        discord_id,
        username,
        display_name,
        avatar_url is not null as has_avatar,
        created_at,
        updated_at
      from public.profiles
      order by created_at desc
      limit 5
    ) as recent_profile
  ), '[]'::jsonb) as recent_profiles;
