CREATE UNIQUE INDEX IF NOT EXISTS time_entries_pool_key_unique
  ON public.time_entries (organization_id, import_key)
  WHERE source = 'pool' AND import_key IS NOT NULL;