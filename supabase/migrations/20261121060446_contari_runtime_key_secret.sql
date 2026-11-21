create schema if not exists private;
create table if not exists private.contari_runtime_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke all on private.contari_runtime_secrets from public, anon, authenticated;
grant select on private.contari_runtime_secrets to service_role;
insert into private.contari_runtime_secrets(name, value)
values ('locker_key_encryption_v1', encode(gen_random_bytes(32), 'base64'))
on conflict (name) do nothing;
