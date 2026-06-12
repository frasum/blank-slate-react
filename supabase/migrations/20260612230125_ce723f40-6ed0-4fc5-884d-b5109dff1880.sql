-- Härtung organization_settings: Schreibzugriff nur via Service Role.
-- Vorher: authenticated hatte INSERT/UPDATE + Admin-Policies → setTimeLock umgehbar,
-- Audit-Pflicht beim Verschieben der Wasserlinie nicht erzwungen.
drop policy if exists "org_settings_insert_admin" on public.organization_settings;
drop policy if exists "org_settings_update_admin" on public.organization_settings;

revoke insert, update, delete on public.organization_settings from authenticated;
-- SELECT bleibt für authenticated (Policy org_settings_select_own_org filtert per Org).
