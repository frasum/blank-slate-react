
-- Owner-Read: verknüpfter Staff darf eigene Dateien lesen (path = "<orgId>/<staffId>/…")
DROP POLICY IF EXISTS "staff-documents own read" ON storage.objects;
CREATE POLICY "staff-documents own read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_links ul
     WHERE ul.user_id = auth.uid()
       AND ul.staff_id::text = split_part(storage.objects.name, '/', 2)
       AND ul.organization_id::text = split_part(storage.objects.name, '/', 1)
  )
);

-- Manager/Admin-Read: Rolle mit passender Org
DROP POLICY IF EXISTS "staff-documents manager read" ON storage.objects;
CREATE POLICY "staff-documents manager read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND EXISTS (
    SELECT 1 FROM public.role_assignments ra
      JOIN public.user_links ul
        ON ul.staff_id = ra.staff_id AND ul.organization_id = ra.organization_id
     WHERE ul.user_id = auth.uid()
       AND ra.role IN ('admin'::public.app_role, 'manager'::public.app_role)
       AND ra.organization_id::text = split_part(storage.objects.name, '/', 1)
  )
);

-- Kein Client-Insert/Update/Delete: schreiben ausschließlich via Server-Functions (service_role).
