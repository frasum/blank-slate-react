alter table public.organization_settings
  add column if not exists kitchen_manual_only boolean not null default false;

alter table public.session_tip_pool_entries
  add column if not exists shift_start time,
  add column if not exists shift_end   time;