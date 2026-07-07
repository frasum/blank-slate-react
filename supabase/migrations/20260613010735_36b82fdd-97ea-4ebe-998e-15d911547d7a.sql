
-- B3a — Kasse / Tagesabschluss: Schema + RLS
-- Alle Geldfelder als BIGINT in Cents (Vermeidung NUMERIC-Rundungsdrift).
-- Sessions & Satelliten: Client-Write DENY-ALL, ausschließlich Server-Functions.

------------------------------------------------------------
-- 0) organization_settings erweitern
------------------------------------------------------------
alter table public.organization_settings
  add column if not exists kitchen_tip_rate numeric(5,4) not null default 0.0200
    check (kitchen_tip_rate >= 0 and kitchen_tip_rate <= 1),
  add column if not exists cash_locked_through_date date;

------------------------------------------------------------
-- 1) Enums
------------------------------------------------------------
do $$ begin
  create type public.session_status as enum ('open', 'finalized', 'locked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.waiter_settlement_status as enum
    ('draft', 'submitted', 'corrected', 'superseded', 'locked');
exception when duplicate_object then null; end $$;

do $$ begin
  -- BFIX4: enthält auch die 2 später ergänzten Werte (to_safe, to_other);
  -- ALTER TYPE ADD VALUE IF NOT EXISTS weiter unten in der Kette sind No-ops.
  create type public.register_transfer_direction as enum
    ('to_restaurant', 'from_restaurant', 'to_safe', 'to_other');
exception when duplicate_object then null; end $$;

------------------------------------------------------------
-- 2) revenue_channels
------------------------------------------------------------
create table public.revenue_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, label)
);

grant select, insert, update, delete on public.revenue_channels to authenticated;
grant all on public.revenue_channels to service_role;
alter table public.revenue_channels enable row level security;

create policy "rc_select_own_org" on public.revenue_channels
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "rc_insert_manager" on public.revenue_channels
  for insert to authenticated
  with check (organization_id = public.current_organization_id()
              and public.has_min_permission('manager'));

create policy "rc_update_manager" on public.revenue_channels
  for update to authenticated
  using (organization_id = public.current_organization_id()
         and public.has_min_permission('manager'))
  with check (organization_id = public.current_organization_id()
              and public.has_min_permission('manager'));

create policy "rc_delete_admin" on public.revenue_channels
  for delete to authenticated
  using (organization_id = public.current_organization_id()
         and public.is_admin());

create trigger tg_revenue_channels_updated_at
  before update on public.revenue_channels
  for each row execute function public.tg_time_entries_set_updated_at();

------------------------------------------------------------
-- 3) payment_terminals (analog)
------------------------------------------------------------
create table public.payment_terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, label)
);

grant select, insert, update, delete on public.payment_terminals to authenticated;
grant all on public.payment_terminals to service_role;
alter table public.payment_terminals enable row level security;

create policy "pt_select_own_org" on public.payment_terminals
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "pt_insert_manager" on public.payment_terminals
  for insert to authenticated
  with check (organization_id = public.current_organization_id()
              and public.has_min_permission('manager'));

create policy "pt_update_manager" on public.payment_terminals
  for update to authenticated
  using (organization_id = public.current_organization_id()
         and public.has_min_permission('manager'))
  with check (organization_id = public.current_organization_id()
              and public.has_min_permission('manager'));

create policy "pt_delete_admin" on public.payment_terminals
  for delete to authenticated
  using (organization_id = public.current_organization_id()
         and public.is_admin());

create trigger tg_payment_terminals_updated_at
  before update on public.payment_terminals
  for each row execute function public.tg_time_entries_set_updated_at();

------------------------------------------------------------
-- 4) sessions
------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_date date not null,
  status public.session_status not null default 'open',
  opening_balance_cents bigint,
  vouchers_sold_cents bigint not null default 0,
  vouchers_redeemed_cents bigint not null default 0,
  finedine_vouchers_cents bigint not null default 0,
  opentabs_deduction_cents bigint not null default 0,
  vorschuss_cents bigint not null default 0,
  einladung_cents bigint not null default 0,
  sonstige_einnahme_cents bigint not null default 0,
  notes text,
  finalized_at timestamptz,
  finalized_by uuid references public.staff(id),
  locked_at timestamptz,
  locked_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, business_date)
);

-- DENY-ALL Client-Write (nur SELECT, kein INSERT/UPDATE/DELETE-Grant).
grant select on public.sessions to authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;

create policy "sessions_select_own_org" on public.sessions
  for select to authenticated
  using (organization_id = public.current_organization_id());

create trigger tg_sessions_updated_at
  before update on public.sessions
  for each row execute function public.tg_time_entries_set_updated_at();

------------------------------------------------------------
-- 5) session_channel_amounts / session_terminal_amounts
------------------------------------------------------------
create table public.session_channel_amounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  channel_id uuid not null references public.revenue_channels(id) on delete restrict,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, channel_id)
);

grant select on public.session_channel_amounts to authenticated;
grant all on public.session_channel_amounts to service_role;
alter table public.session_channel_amounts enable row level security;

create policy "sca_select_own_org" on public.session_channel_amounts
  for select to authenticated
  using (organization_id = public.current_organization_id());

create trigger tg_sca_updated_at
  before update on public.session_channel_amounts
  for each row execute function public.tg_time_entries_set_updated_at();

create table public.session_terminal_amounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  terminal_id uuid not null references public.payment_terminals(id) on delete restrict,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, terminal_id)
);

grant select on public.session_terminal_amounts to authenticated;
grant all on public.session_terminal_amounts to service_role;
alter table public.session_terminal_amounts enable row level security;

create policy "sta_select_own_org" on public.session_terminal_amounts
  for select to authenticated
  using (organization_id = public.current_organization_id());

create trigger tg_sta_updated_at
  before update on public.session_terminal_amounts
  for each row execute function public.tg_time_entries_set_updated_at();

------------------------------------------------------------
-- 6) waiter_settlements (append-only)
------------------------------------------------------------
create table public.waiter_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete restrict,
  pos_sales_cents bigint not null default 0,
  card_total_cents bigint not null default 0,
  hilf_mahl_cents bigint not null default 0,
  open_invoices_cents bigint not null default 0,
  cash_handed_in_cents bigint not null default 0,
  differenz_cents bigint not null default 0,
  kitchen_tip_cents bigint not null default 0,
  kitchen_tip_rate numeric(5,4) not null,
  status public.waiter_settlement_status not null default 'draft',
  submitted_at timestamptz,
  corrected_from_id uuid references public.waiter_settlements(id) on delete restrict,
  auto_clockout_time_entry_id uuid references public.time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Genau eine aktive (nicht-superseded) Settlement pro (session, staff).
create unique index waiter_settlements_active_per_staff
  on public.waiter_settlements (session_id, staff_id)
  where status <> 'superseded';

grant select, insert, update on public.waiter_settlements to authenticated;
grant all on public.waiter_settlements to service_role;
alter table public.waiter_settlements enable row level security;

-- Kellner: nur eigene Zeilen.
create policy "ws_select_own_staff" on public.waiter_settlements
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      staff_id = public.current_staff_id()
      or public.has_min_permission('manager')
    )
  );

-- Kellner darf eigene Zeile nur für laufenden Geschäftstag im Status draft anlegen.
create policy "ws_insert_self_today_draft" on public.waiter_settlements
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and staff_id = public.current_staff_id()
    and status = 'draft'
    and exists (
      select 1 from public.sessions s
      where s.id = waiter_settlements.session_id
        and s.organization_id = waiter_settlements.organization_id
        and s.business_date = public.current_business_date()
        and s.status = 'open'
    )
  );

-- Kellner darf nur eigenen draft ändern; Felder-Schutz übernimmt die Server-Function (Snapshot).
create policy "ws_update_self_draft" on public.waiter_settlements
  for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and staff_id = public.current_staff_id()
    and status = 'draft'
  )
  with check (
    organization_id = public.current_organization_id()
    and staff_id = public.current_staff_id()
    and status = 'draft'
  );

create trigger tg_waiter_settlements_updated_at
  before update on public.waiter_settlements
  for each row execute function public.tg_time_entries_set_updated_at();

------------------------------------------------------------
-- 7) Satelliten (DENY-ALL Client-Write, nur SELECT)
------------------------------------------------------------
create table public.session_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  description text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);
grant select on public.session_expenses to authenticated;
grant all on public.session_expenses to service_role;
alter table public.session_expenses enable row level security;
create policy "se_select_own_org" on public.session_expenses
  for select to authenticated
  using (organization_id = public.current_organization_id());

create table public.session_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete restrict,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.session_advances to authenticated;
grant all on public.session_advances to service_role;
alter table public.session_advances enable row level security;
create policy "sa_select_own_org" on public.session_advances
  for select to authenticated
  using (organization_id = public.current_organization_id());

create table public.session_card_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  terminal_id uuid references public.payment_terminals(id) on delete set null,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.session_card_transactions to authenticated;
grant all on public.session_card_transactions to service_role;
alter table public.session_card_transactions enable row level security;
create policy "sct_select_own_org" on public.session_card_transactions
  for select to authenticated
  using (organization_id = public.current_organization_id());

create table public.session_bank_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  amount_cents bigint not null,
  reference text,
  created_at timestamptz not null default now()
);
grant select on public.session_bank_deposits to authenticated;
grant all on public.session_bank_deposits to service_role;
alter table public.session_bank_deposits enable row level security;
create policy "sbd_select_own_org" on public.session_bank_deposits
  for select to authenticated
  using (organization_id = public.current_organization_id());

create table public.session_register_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  direction public.register_transfer_direction not null,
  amount_cents bigint not null check (amount_cents >= 0),
  note text,
  created_at timestamptz not null default now()
);
grant select on public.session_register_transfers to authenticated;
grant all on public.session_register_transfers to service_role;
alter table public.session_register_transfers enable row level security;
create policy "srt_select_own_org" on public.session_register_transfers
  for select to authenticated
  using (organization_id = public.current_organization_id());

------------------------------------------------------------
-- 8) Indizes für übliche Abfragen
------------------------------------------------------------
create index sessions_org_date_idx on public.sessions (organization_id, business_date desc);
create index ws_session_idx on public.waiter_settlements (session_id);
create index ws_staff_idx on public.waiter_settlements (organization_id, staff_id);
create index se_session_idx on public.session_expenses (session_id);
create index sa_session_idx on public.session_advances (session_id);
create index sct_session_idx on public.session_card_transactions (session_id);
create index sbd_session_idx on public.session_bank_deposits (session_id);
create index srt_session_idx on public.session_register_transfers (session_id);
