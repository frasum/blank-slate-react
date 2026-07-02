create table public.settlement_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  settlement_id uuid not null references public.waiter_settlements(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (settlement_id, staff_id)
);

grant select on public.settlement_partners to authenticated;
grant all on public.settlement_partners to service_role;

create index idx_settlement_partners_org on public.settlement_partners (organization_id);
create index idx_settlement_partners_settlement on public.settlement_partners (settlement_id);

alter table public.settlement_partners enable row level security;

create policy "settlement_partners_select" on public.settlement_partners
  for select using (organization_id = public.current_organization_id());

insert into public.settlement_partners (organization_id, settlement_id, staff_id)
select organization_id, id, partner_staff_id
from public.waiter_settlements
where partner_staff_id is not null
on conflict (settlement_id, staff_id) do nothing;