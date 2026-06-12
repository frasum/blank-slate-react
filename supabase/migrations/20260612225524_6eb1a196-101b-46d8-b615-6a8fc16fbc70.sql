create or replace function public.tg_organizations_create_settings()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.organization_settings (organization_id)
  values (NEW.id)
  on conflict (organization_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists tg_organizations_create_settings on public.organizations;
create trigger tg_organizations_create_settings
  after insert on public.organizations
  for each row execute function public.tg_organizations_create_settings();
