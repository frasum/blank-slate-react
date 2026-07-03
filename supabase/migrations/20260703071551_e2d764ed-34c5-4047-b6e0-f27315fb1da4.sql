alter table public.staff_personal_details
  add column if not exists ist_werkstudent boolean not null default false;

comment on column public.staff_personal_details.ist_werkstudent is
  'Werkstudentenprivileg: KV/PV/AV-frei, RV-pflichtig; LSt mit Mindestvorsorgepauschale (PAP PKV=1, PKPV=0).';

notify pgrst, 'reload schema';