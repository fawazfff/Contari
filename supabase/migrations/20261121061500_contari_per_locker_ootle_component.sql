alter table public.contari_lockers
  add column if not exists ootle_component_address text;

alter table public.contari_lockers
  drop constraint if exists contari_lockers_ootle_component_address_check;
alter table public.contari_lockers
  add constraint contari_lockers_ootle_component_address_check
  check (
    ootle_component_address is null
    or ootle_component_address ~ '^component_[0-9a-fA-F]{64}$'
  );
