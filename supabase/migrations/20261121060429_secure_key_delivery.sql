-- Server-gated, wallet-authenticated key delivery for Contari.
-- Existing key_version=1 lockers are legacy bearer links and must be recreated.
alter table public.contari_lockers
  add column if not exists creator_network text not null default 'legacy',
  add column if not exists key_version smallint not null default 1;

alter table public.contari_lockers
  drop constraint if exists contari_lockers_key_version_check;
alter table public.contari_lockers
  add constraint contari_lockers_key_version_check check (key_version in (1, 2));

create table if not exists public.contari_key_vault (
  locker_id text primary key references public.contari_lockers(id) on delete cascade,
  wrapped_key text not null,
  wrap_iv text not null,
  key_version smallint not null default 1 check (key_version = 1),
  created_at timestamptz not null default now()
);

create table if not exists public.contari_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  locker_id text not null check (locker_id ~ '^[a-zA-Z0-9_-]{8,32}$'),
  purpose text not null check (purpose in ('create', 'unlock', 'delete')),
  wallet_address text not null,
  challenge text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contari_auth_challenges_wallet_created_idx
  on public.contari_auth_challenges(wallet_address, created_at desc);
create index if not exists contari_auth_challenges_expiry_idx
  on public.contari_auth_challenges(expires_at);

alter table public.contari_key_vault enable row level security;
alter table public.contari_auth_challenges enable row level security;

revoke all on public.contari_key_vault from anon, authenticated, public;
revoke all on public.contari_auth_challenges from anon, authenticated, public;
grant all on public.contari_key_vault to service_role;
grant all on public.contari_auth_challenges to service_role;

drop policy if exists "Wallet creators insert lockers" on public.contari_lockers;
drop policy if exists "Contari owners insert lockers" on public.contari_lockers;
drop policy if exists "Contari owners update lockers" on public.contari_lockers;
drop policy if exists "Contari owners delete lockers" on public.contari_lockers;
revoke insert, update, delete on public.contari_lockers from anon, authenticated, public;
grant select on public.contari_lockers to anon, authenticated;
grant insert, update, delete, select on public.contari_lockers to service_role;
