create table if not exists public.lohn_absence_days (
  staff_id uuid not null references public.staff(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  urlaub_tage integer not null default 0 check (urlaub_tage >= 0 and urlaub_tage <= 31),
  krank_tage  integer not null default 0 check (krank_tage  >= 0 and krank_tage  <= 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, period_start)
);

grant select, insert, update, delete on public.lohn_absence_days to authenticated;
grant all on public.lohn_absence_days to service_role;

alter table public.lohn_absence_days enable row level security;

drop policy if exists lohn_absence_days_select on public.lohn_absence_days;
create policy lohn_absence_days_select on public.lohn_absence_days
for select to authenticated
using (organization_id = public.current_organization_id());

drop policy if exists lohn_absence_days_write on public.lohn_absence_days;
create policy lohn_absence_days_write on public.lohn_absence_days
for all to authenticated
using (organization_id = public.current_organization_id() and public.has_min_permission('manager'))
with check (organization_id = public.current_organization_id() and public.has_min_permission('manager'));

drop trigger if exists trg_lohn_absence_days_updated_at on public.lohn_absence_days;
create trigger trg_lohn_absence_days_updated_at
before update on public.lohn_absence_days
for each row execute function public.tg_set_updated_at();
