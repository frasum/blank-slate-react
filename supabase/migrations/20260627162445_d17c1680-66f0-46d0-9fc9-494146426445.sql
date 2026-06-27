
-- Storage RLS for the private payslips bucket.
-- Path convention: {organization_id}/{staff_id}/<filename>

DROP POLICY IF EXISTS "payslips_select_own_or_org_manager" ON storage.objects;
DROP POLICY IF EXISTS "payslips_insert_org_manager" ON storage.objects;
DROP POLICY IF EXISTS "payslips_update_org_manager" ON storage.objects;
DROP POLICY IF EXISTS "payslips_delete_org_manager" ON storage.objects;

CREATE POLICY "payslips_select_own_or_org_manager"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payslips'
  AND (
    -- staff can read their own payslips
    EXISTS (
      SELECT 1
      FROM public.user_links ul
      WHERE ul.user_id = auth.uid()
        AND (storage.foldername(name))[1] = ul.organization_id::text
        AND (storage.foldername(name))[2] = ul.staff_id::text
    )
    -- admins/managers can read all payslips of their organization
    OR EXISTS (
      SELECT 1
      FROM public.user_links ul
      JOIN public.role_assignments ra
        ON ra.staff_id = ul.staff_id
       AND ra.organization_id = ul.organization_id
      WHERE ul.user_id = auth.uid()
        AND (storage.foldername(name))[1] = ul.organization_id::text
        AND ra.role IN ('admin'::public.app_role, 'manager'::public.app_role)
    )
  )
);

CREATE POLICY "payslips_insert_org_manager"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payslips'
  AND EXISTS (
    SELECT 1
    FROM public.user_links ul
    JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id
     AND ra.organization_id = ul.organization_id
    WHERE ul.user_id = auth.uid()
      AND (storage.foldername(name))[1] = ul.organization_id::text
      AND ra.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  )
);

CREATE POLICY "payslips_update_org_manager"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payslips'
  AND EXISTS (
    SELECT 1
    FROM public.user_links ul
    JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id
     AND ra.organization_id = ul.organization_id
    WHERE ul.user_id = auth.uid()
      AND (storage.foldername(name))[1] = ul.organization_id::text
      AND ra.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'payslips'
  AND EXISTS (
    SELECT 1
    FROM public.user_links ul
    JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id
     AND ra.organization_id = ul.organization_id
    WHERE ul.user_id = auth.uid()
      AND (storage.foldername(name))[1] = ul.organization_id::text
      AND ra.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  )
);

CREATE POLICY "payslips_delete_org_manager"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payslips'
  AND EXISTS (
    SELECT 1
    FROM public.user_links ul
    JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id
     AND ra.organization_id = ul.organization_id
    WHERE ul.user_id = auth.uid()
      AND (storage.foldername(name))[1] = ul.organization_id::text
      AND ra.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  )
);
