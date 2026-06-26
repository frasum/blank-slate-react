alter table public.staff_personal_details
  add column if not exists rv_frei boolean not null default false,
  add column if not exists av_frei boolean not null default false,
  add column if not exists lst_freibetrag_monat_cent integer not null default 0;