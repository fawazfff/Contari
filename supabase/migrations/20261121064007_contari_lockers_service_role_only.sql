-- The app reads lockers only through contari-secure, which verifies
-- wallet challenges and applies access rules before returning any key.
revoke all on public.contari_lockers from anon, authenticated;
revoke all on public.contari_key_vault from anon, authenticated;
revoke all on public.contari_auth_challenges from anon, authenticated;

-- The server-side master-key RPC is callable only by the Edge Function's
-- service-role client, never by browser roles or PUBLIC.
revoke all on function public.contari_get_master_key() from public, anon, authenticated;
grant execute on function public.contari_get_master_key() to service_role;
