-- B2b Vorarbeit: organization_settings (Wasserlinie) + time_entries.break_minutes

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  time_locked_through_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.organization_settings to authenticated;
grant all on public.organization_settings to service_role;

alter table public.organization_settings enable row level security;

create policy "org_settings_select_own_org"
  on public.organization_settings for select
  to authenticated
  using (organization_id = public.current_organization_id());

create policy "org_settings_insert_admin"
  on public.organization_settings for insert
  to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_admin()
  );

create policy "org_settings_update_admin"
  on public.organization_settings for update
  to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_admin()
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_admin()
  );

create trigger tg_organization_settings_updated_at
  before update on public.organization_settings
  for each row execute function public.tg_time_entries_set_updated_at();

-- Eine Zeile pro existierender Organisation anlegen (Wasserlinie initial NULL = nichts gesperrt).
insert into public.organization_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- Pause als Pflichtfeld an time_entries (Default 0, plausibler Wertebereich).
alter table public.time_entries
  add column break_minutes integer not null default 0
  check (break_minutes >= 0 and break_minutes < 480);
