-- AV1a Stufe 1 — Adresse strukturiert (street/postal_code/city).
-- Freitext `address` bleibt als Migrationspuffer bestehen; RLS und Rollen
-- (admin+payroll r/w) unverändert. Reine additive Spalten-Erweiterung.
ALTER TABLE public.staff_personal_details
  ADD COLUMN IF NOT EXISTS street text NULL,
  ADD COLUMN IF NOT EXISTS postal_code text NULL,
  ADD COLUMN IF NOT EXISTS city text NULL;