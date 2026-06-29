-- Korrektur: redundante staff_absences entfernen; roster_absence um type='krank' erweitern.

-- 1) Fehlanlage entfernen (war redundant zu roster_absence/leave_requests; nichts liest sie)
drop table if exists public.staff_absences;
drop type  if exists public.absence_type;

-- 2) roster_absence: type='krank' zulassen (Code unterstützt urlaub|krank bereits)
alter table public.roster_absence drop constraint if exists roster_absence_type_check;
alter table public.roster_absence
  add  constraint roster_absence_type_check check (type in ('urlaub','krank'));
