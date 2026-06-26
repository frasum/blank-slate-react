alter table public.staff_personal_details
  add column if not exists is_midijob boolean not null default false,
  add column if not exists kv_frei boolean not null default false,
  add column if not exists pv_frei boolean not null default false;