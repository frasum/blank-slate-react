-- Nachzieh-Migration: SELECT-Härtung Lohn-Tabellen (Live-Fix vom 03.07.2026,
-- per Direkt-SQL ausgeführt; hiermit im Repo verankert).
-- Ehrlichkeitsregel: dieser Commit ÄNDERT auf der Live-DB nichts, er
-- synchronisiert die Migrationshistorie mit dem Live-Zustand.

drop policy if exists lohn_absence_days_select on public.lohn_absence_days;
create policy lohn_absence_days_select on public.lohn_absence_days
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );

drop policy if exists lohn_recurring_zeilen_select on public.lohn_recurring_zeilen;
create policy lohn_recurring_zeilen_select on public.lohn_recurring_zeilen
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );