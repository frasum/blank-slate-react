-- 1) Impersonations-Tabelle
create table public.admin_impersonations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admin_user_id  uuid not null,
  target_staff_id uuid not null references public.staff(id) on delete cascade,
  target_user_id  uuid,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  reason text
);

create unique index admin_impersonations_one_active_per_admin
  on public.admin_impersonations (admin_user_id)
  where ended_at is null;

create index admin_impersonations_admin_user_id_idx
  on public.admin_impersonations (admin_user_id);

grant select on public.admin_impersonations to authenticated;
grant all    on public.admin_impersonations to service_role;

alter table public.admin_impersonations enable row level security;

create policy "own impersonations readable"
  on public.admin_impersonations
  for select
  to authenticated
  using (admin_user_id = auth.uid());

-- 2) effective user id helper
create or replace function public._effective_user_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select ul.user_id
        from public.admin_impersonations ai
        join public.user_links ul
          on ul.staff_id = ai.target_staff_id
         and ul.organization_id = ai.organization_id
       where ai.admin_user_id = auth.uid()
         and ai.ended_at is null
       limit 1
    ),
    auth.uid()
  )
$$;

-- 3) Bestehende Helfer umbauen (gleiche Signatur, CREATE OR REPLACE)
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select ra.role
    from public.role_assignments ra
    join public.user_links ul
      on ul.staff_id = ra.staff_id
     and ul.organization_id = ra.organization_id
   where ul.user_id = public._effective_user_id()
$$;

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select staff_id
    from public.user_links
   where user_id = public._effective_user_id()
   order by staff_id
   limit 1
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select organization_id
    from public.user_links
   where user_id = public._effective_user_id()
   order by organization_id
   limit 1
$$;

create or replace function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.role_assignments ra
      join public.user_links ul
        on ul.staff_id = ra.staff_id
       and ul.organization_id = ra.organization_id
     where ul.user_id = public._effective_user_id()
       and ra.role = _role
  )
$$;

-- 4) is_real_admin: echte Identität, ohne Impersonation-Indirektion
create or replace function public.is_real_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.role_assignments ra
      join public.user_links ul
        on ul.staff_id = ra.staff_id
       and ul.organization_id = ra.organization_id
     where ul.user_id = auth.uid()
       and ra.role = 'admin'::public.app_role
  )
$$;