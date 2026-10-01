-- v0.71.0 / Contract 18. Preserve existing permission; private joining is opt-in.
begin;
alter table public.duel_social_preferences add column if not exists lobby_join_mode text;
update public.duel_social_preferences
set lobby_join_mode = case when allow_lobby_join then 'public' else 'none' end
where lobby_join_mode is null;
alter table public.duel_social_preferences alter column lobby_join_mode set default 'public';
alter table public.duel_social_preferences alter column lobby_join_mode set not null;
alter table public.duel_social_preferences drop constraint if exists duel_social_preferences_lobby_join_mode_check;
alter table public.duel_social_preferences add constraint duel_social_preferences_lobby_join_mode_check
  check (lobby_join_mode in ('public', 'private', 'none'));

create or replace function public.gateway_social_contract_version()
returns integer language sql stable security invoker set search_path = '' as $$ select 18; $$;
revoke all on function public.gateway_social_contract_version() from public, anon, authenticated;
grant execute on function public.gateway_social_contract_version() to service_role;
commit;
