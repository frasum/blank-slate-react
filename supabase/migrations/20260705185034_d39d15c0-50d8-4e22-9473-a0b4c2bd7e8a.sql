create table public.sales_article_stats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  period text not null check (period in ('d365','alltime')),
  nummer int not null,
  name text not null,
  verkauf_count int not null default 0,
  umsatz_cents bigint not null default 0,
  report_date date not null,
  created_at timestamptz not null default now(),
  constraint sales_article_stats_unique unique (location_id, period, nummer)
);

create index sales_article_stats_org_loc_period_idx
  on public.sales_article_stats (organization_id, location_id, period);

grant all on public.sales_article_stats to service_role;

alter table public.sales_article_stats enable row level security;

create policy "sales_article_stats deny all"
  on public.sales_article_stats
  for all
  to authenticated, anon
  using (false)
  with check (false);