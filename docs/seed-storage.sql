-- Storage-Buckets für COCO — dokumentiertes Ops-Seed (KEINE Migration!).
-- Hintergrund: Der Lovable-Migrations-Guard blockiert Schreibzugriffe auf
-- storage.buckets in Migrationsdateien (bucket_sql_blocked). Buckets werden
-- daher wie die Organisation (docs/seed-organization.sql) manuell angelegt:
-- bei DB-Neuaufbau NACH dem Einspielen aller Migrationen einmalig im
-- Supabase-Editor ausführen. Idempotent.
-- Die zugehörigen storage.objects-Policies (payslips) liegen regulär in den
-- Migrationen; staff-documents hat bewusst KEINE objects-Policies
-- (kein Client-Zugriff, nur service_role — siehe ARBEITSWEISE §43).

INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips','payslips', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-documents','staff-documents', false)
ON CONFLICT (id) DO NOTHING;