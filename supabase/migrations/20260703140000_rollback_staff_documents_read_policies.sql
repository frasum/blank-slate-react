-- Rückbau der storage.objects-SELECT-Policies aus 20260703112045
-- (Entscheidung Frank, 03.07.2026, nach Security-Review): Kein Client-Pfad
-- liest diesen Bucket — Zugriff ausschließlich über Server-Functions
-- (service_role, Signed URLs, Pfad-Guard). Die "manager read"-Policy weitete
-- Rechte über den admin-only Server-Layer hinaus aus. Regel ab jetzt wieder:
-- staff-documents hat NIE Client-Policies (wie payslips).
DROP POLICY IF EXISTS "staff-documents own read" ON storage.objects;
DROP POLICY IF EXISTS "staff-documents manager read" ON storage.objects;
