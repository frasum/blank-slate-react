-- Trigger-Fn ist nur als interner AFTER-INSERT-Trigger gedacht. EXECUTE
-- entziehen, damit kein neuer SECURITY-DEFINER-Linter-Warn entsteht.
REVOKE EXECUTE ON FUNCTION public.tg_locations_seed_defaults() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_locations_seed_defaults() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_locations_seed_defaults() FROM authenticated;