-- PL1: Neue Rechte-Enum-Werte für Schichttausch-Verwaltung.
-- Additiv; keine RLS/Table-Änderung; nur Katalog-Erweiterung + Defaults für manager/admin.
-- Für planer bleibt kein Default — Zugriff ausschließlich über permission_overrides
-- (locationId + area).
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.swap.view_pending';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.swap.decide';