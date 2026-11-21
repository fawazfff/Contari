-- Locker creation is performed only by the contari-secure Edge Function using
-- its service-role client after a verified Tari wallet signature.
-- Direct public inserts would let anyone spoof creator identities or poison IDs.
drop policy if exists "Wallet creators insert lockers" on public.contari_lockers;
drop policy if exists "Contari owners insert lockers" on public.contari_lockers;
revoke insert, update, delete on public.contari_lockers from anon, authenticated;
grant select on public.contari_lockers to anon, authenticated;

-- These tables contain key material and one-time authentication challenges.
-- Keep them service-role-only; RLS is enabled and intentionally has no public policies.
revoke all on public.contari_key_vault from anon, authenticated;
revoke all on public.contari_auth_challenges from anon, authenticated;
