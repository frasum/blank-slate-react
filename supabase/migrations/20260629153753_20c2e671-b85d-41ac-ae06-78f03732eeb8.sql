-- staff_absences: Abwesenheiten (Urlaub / Krank / Sonderurlaub), Quelle thaitime.absence_entries

-- 1) Enum (idempotent)
do $$ begin
  create type public.absence_type as enum ('urlaub','krankheit','sonderurlaub');
exception when duplicate_object then null;
end $$;

-- 2) Tabelle (existiert evtl. schon aus dem Direkt-Lauf)
create table if not exists public.staff_absences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  absence_type public.absence_type not null,
  start_date date not null,
  end_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_range check (end_date >= start_date)
);

grant select, insert, update, delete on public.staff_absences to authenticated;
grant all on public.staff_absences to service_role;

-- 3) Indizes
create index if not exists idx_staff_absences_org_dates
  on public.staff_absences (organization_id, start_date, end_date);
create index if not exists idx_staff_absences_staff
  on public.staff_absences (staff_id);

-- 4) RLS aktivieren + Policies (Drop-before-Create gegen die ODER-Falle)
alter table public.staff_absences enable row level security;

drop policy if exists staff_absences_select_mgr on public.staff_absences;
create policy staff_absences_select_mgr on public.staff_absences
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (public.has_min_permission('manager') or public.has_role('payroll'::public.app_role))
  );

drop policy if exists staff_absences_select_own on public.staff_absences;
create policy staff_absences_select_own on public.staff_absences
  for select to authenticated
  using (staff_id = public.current_staff_id());

drop policy if exists staff_absences_insert_mgr on public.staff_absences;
create policy staff_absences_insert_mgr on public.staff_absences
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );

drop policy if exists staff_absences_update_mgr on public.staff_absences;
create policy staff_absences_update_mgr on public.staff_absences
  for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );

drop policy if exists staff_absences_delete_mgr on public.staff_absences;
create policy staff_absences_delete_mgr on public.staff_absences
  for delete to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );

-- 5) updated_at-Trigger (Muster wie roster_shifts)
drop trigger if exists tg_staff_absences_updated_at on public.staff_absences;
create trigger tg_staff_absences_updated_at
  before update on public.staff_absences
  for each row execute function public.tg_set_updated_at();
