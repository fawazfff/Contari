-- Contari cloud lockers and claim-attempt records.
-- Public users may read ciphertext; only signed-in owners may create/manage lockers.
-- Claim records are client-reported and are not proof-verified by this schema.

create table if not exists public.contari_lockers (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{8,32}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 160),
  ciphertext text not null,
  iv text not null,
  gate text not null check (gate in ('wallet','allowlist')),
  allowed_wallets text[] not null default '{}',
  creator_wallet text not null default 'anonymous',
  created_at timestamptz not null default now()
);

create index if not exists contari_lockers_owner_created_idx
  on public.contari_lockers(owner_id, created_at desc);

create table if not exists public.contari_claims (
  id uuid primary key default gen_random_uuid(),
  locker_id text not null references public.contari_lockers(id) on delete cascade,
  claimant_wallet text not null,
  proof jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contari_claims_locker_created_idx
  on public.contari_claims(locker_id, created_at desc);

alter table public.contari_lockers enable row level security;
alter table public.contari_claims enable row level security;

drop policy if exists "Anyone can read encrypted Contari lockers" on public.contari_lockers;
create policy "Anyone can read encrypted Contari lockers"
  on public.contari_lockers for select to anon, authenticated using (true);

drop policy if exists "Contari owners insert lockers" on public.contari_lockers;
create policy "Contari owners insert lockers"
  on public.contari_lockers for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Contari owners update lockers" on public.contari_lockers;
create policy "Contari owners update lockers"
  on public.contari_lockers for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Contari owners delete lockers" on public.contari_lockers;
create policy "Contari owners delete lockers"
  on public.contari_lockers for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Visitors can add Contari claims" on public.contari_claims;
create policy "Visitors can add Contari claims"
  on public.contari_claims for insert to authenticated with check (true);

drop policy if exists "Locker owners can read Contari claims" on public.contari_claims;
create policy "Locker owners can read Contari claims"
  on public.contari_claims for select to authenticated
  using (
    exists (
      select 1 from public.contari_lockers l
      where l.id = locker_id and l.owner_id = (select auth.uid())
    )
  );

grant select on public.contari_lockers to anon, authenticated;
grant insert, update, delete on public.contari_lockers to authenticated;
grant select, insert on public.contari_claims to authenticated;
