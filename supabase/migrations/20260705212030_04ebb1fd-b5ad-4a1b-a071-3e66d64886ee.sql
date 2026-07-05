create table public.display_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  emoji text check (emoji is null or length(emoji) between 1 and 8),
  color text not null check (color in ('grau','braun','blau','gruen','gelb','orange','rot','violett')),
  weekday int not null check (weekday between 0 and 6),
  interval_weeks int not null default 1 check (interval_weeks in (1, 2)),
  anchor_date date,
  from_time time not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_reminders_anchor_required
    check (interval_weeks = 1 or anchor_date is not null)
);

create index display_reminders_org_loc_idx
  on public.display_reminders (organization_id, location_id);

grant all on public.display_reminders to service_role;

alter table public.display_reminders enable row level security;

create policy "display_reminders deny all"
  on public.display_reminders
  for all
  to authenticated, anon
  using (false)
  with check (false);

create trigger display_reminders_set_updated_at
  before update on public.display_reminders
  for each row execute function public.tg_set_updated_at();