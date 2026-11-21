create or replace function public.contari_get_master_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare secret_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  select value into secret_value
  from private.contari_runtime_secrets
  where name = 'locker_key_encryption_v1';
  if secret_value is null then
    raise exception 'Contari master key is not configured';
  end if;
  return secret_value;
end;
$$;
revoke all on function public.contari_get_master_key() from public, anon, authenticated;
grant execute on function public.contari_get_master_key() to service_role;
