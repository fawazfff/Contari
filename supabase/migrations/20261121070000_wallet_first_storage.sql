-- Wallet-first Contari storage.
-- Wallet addresses identify locker creators; Supabase email auth is not used.
alter table public.contari_lockers
  alter column owner_id drop not null;

drop policy if exists "Contari owners insert lockers" on public.contari_lockers;
drop policy if exists "Wallet creators insert lockers" on public.contari_lockers;
create policy "Wallet creators insert lockers"
  on public.contari_lockers for insert to anon, authenticated
  with check (
    owner_id is null
    and length(trim(creator_wallet)) > 10
  );

create index if not exists contari_lockers_creator_created_idx
  on public.contari_lockers(creator_wallet, created_at desc);

grant insert, select on public.contari_lockers to anon, authenticated;
