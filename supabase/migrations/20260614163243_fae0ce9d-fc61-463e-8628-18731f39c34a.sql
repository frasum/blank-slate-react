-- B8: Lohnbüro-Rolle 'payroll' — Seitenrolle, NICHT in admin>manager>staff Hierarchie.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'payroll';

-- Commit the new enum value before referencing it in functions/policies.

-- Funktions-/Policy-Teil: siehe 20260614163244_payroll_role_policies.sql.
-- Das fruehere nackte COMMIT;/BEGIN; an dieser Stelle brach `supabase db reset`
-- (alles nach dem BEGIN wurde beim Verbindungsende zurueckgerollt).
