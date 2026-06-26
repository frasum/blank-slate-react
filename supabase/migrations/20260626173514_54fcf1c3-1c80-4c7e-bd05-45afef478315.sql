create table if not exists public.lohn_recurring_zeilen (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bezeichnung text not null,
  betrag_cent integer not null,
  kategorie text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.lohn_recurring_zeilen to authenticated;
grant all on public.lohn_recurring_zeilen to service_role;

alter table public.lohn_recurring_zeilen enable row level security;

drop policy if exists lohn_recurring_zeilen_select on public.lohn_recurring_zeilen;
create policy lohn_recurring_zeilen_select on public.lohn_recurring_zeilen
for select to authenticated
using (organization_id = public.current_organization_id());

drop policy if exists lohn_recurring_zeilen_write on public.lohn_recurring_zeilen;
create policy lohn_recurring_zeilen_write on public.lohn_recurring_zeilen
for all to authenticated
using (organization_id = public.current_organization_id() and public.has_min_permission('manager'))
with check (organization_id = public.current_organization_id() and public.has_min_permission('manager'));

drop trigger if exists trg_lohn_recurring_zeilen_updated_at on public.lohn_recurring_zeilen;
create trigger trg_lohn_recurring_zeilen_updated_at
before update on public.lohn_recurring_zeilen
for each row execute function public.tg_set_updated_at();

create index if not exists lohn_recurring_zeilen_staff_idx on public.lohn_recurring_zeilen (staff_id, sort_order);