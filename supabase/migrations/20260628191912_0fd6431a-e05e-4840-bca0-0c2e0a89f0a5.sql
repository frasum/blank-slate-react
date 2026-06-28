CREATE OR REPLACE FUNCTION public.list_payslip_objects(p_prefix text)
RETURNS TABLE (name text, created_at timestamptz, size bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    substring(o.name FROM char_length(p_prefix) + 2) AS name,
    o.created_at,
    NULLIF(o.metadata->>'size','')::bigint AS size
  FROM storage.objects o
  WHERE o.bucket_id = 'payslips'
    AND o.name LIKE p_prefix || '/%'
    AND o.name NOT LIKE p_prefix || '/%/%'
    AND substring(o.name FROM char_length(p_prefix) + 2) <> '.emptyFolderPlaceholder'
$$;

REVOKE ALL ON FUNCTION public.list_payslip_objects(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_payslip_objects(text) TO service_role;