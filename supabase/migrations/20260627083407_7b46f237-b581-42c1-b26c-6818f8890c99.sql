-- Tabelle article_locations: pro Artikel die Standorte, für die er bestellbar ist.
create table public.article_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (article_id, location_id)
);
create index article_locations_article_idx on public.article_locations (article_id);
create index article_locations_location_idx on public.article_locations (location_id);

-- Zugriff ausschließlich über service_role-Server-Funktionen (Hausmuster wie tasks).
-- RLS aktiv, KEINE Client-Policies.
grant all on public.article_locations to service_role;
alter table public.article_locations enable row level security;

-- Backfill: bestehende Artikel mit ALLEN Standorten ihrer Org verknüpfen
-- (bleiben überall bestellbar; entspricht "Default alle").
insert into public.article_locations (organization_id, article_id, location_id)
select a.organization_id, a.id, l.id
from public.articles a
join public.locations l on l.organization_id = a.organization_id
on conflict (article_id, location_id) do nothing;