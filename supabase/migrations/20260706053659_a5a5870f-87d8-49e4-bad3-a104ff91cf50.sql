-- SL1: supplier_locations — Kundennummer + Aktiv-Status je (Lieferant, Standort).
-- Semantik: KEINE Zeile = aktiv, keine standort-eigene Kundennummer (Fallback auf suppliers.customer_number).
-- Hausmuster: deny-all wie article_locations. Kein Client-Zugriff, nur service_role via Server-Functions.

create table public.supplier_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  customer_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, location_id)
);

create index supplier_locations_supplier_idx on public.supplier_locations (supplier_id);
create index supplier_locations_location_idx on public.supplier_locations (location_id);

grant all on public.supplier_locations to service_role;

alter table public.supplier_locations enable row level security;
-- KEINE Client-Policies. Zugriff ausschließlich über service_role.

create trigger supplier_locations_set_updated_at
before update on public.supplier_locations
for each row execute function public.tg_set_updated_at();