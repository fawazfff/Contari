-- Public locker reads are mediated by the contari-secure Edge Function.
-- Keep the allowlist and vault tables private. This intermediate grant documents
-- the minimal public metadata shape; the later service-role-only migration
-- revokes direct table access after the Edge Function became the sole reader.
revoke select on public.contari_lockers from anon, authenticated;
grant select (
  id, title, description, ciphertext, iv, gate, creator_wallet,
  creator_network, key_version, ootle_component_address, created_at
) on public.contari_lockers to anon, authenticated;
revoke all on public.contari_key_vault from anon, authenticated;
revoke all on public.contari_auth_challenges from anon, authenticated;
