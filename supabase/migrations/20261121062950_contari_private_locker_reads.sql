alter table public.contari_auth_challenges
  drop constraint if exists contari_auth_challenges_purpose_check;
alter table public.contari_auth_challenges
  add constraint contari_auth_challenges_purpose_check
  check (purpose in ('create', 'unlock', 'delete', 'list'));

drop policy if exists "Anyone can read lockers" on public.contari_lockers;
revoke select on public.contari_lockers from anon, authenticated, public;
grant select on public.contari_lockers to service_role;
