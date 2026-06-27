create table public.roster_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  period_id uuid not null references public.periods(id) on delete cascade,
  released_at timestamptz not null default now(),
  released_by uuid references public.staff(id),
  unique (location_id, period_id)
);
create index on public.roster_releases (location_id, period_id);
grant all on public.roster_releases to service_role;
alter table public.roster_releases enable row level security;

insert into public.roster_releases (organization_id, location_id, period_id)
select distinct rs.organization_id, rs.location_id, p.id
from public.roster_shifts rs
join public.periods p
  on p.organization_id = rs.organization_id
  and rs.shift_date between p.start_date and p.end_date
on conflict (location_id, period_id) do nothing;

notify pgrst, 'reload schema';