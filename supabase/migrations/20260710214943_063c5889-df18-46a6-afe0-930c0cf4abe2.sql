-- BK2 — GoCardless BAD Anbindung vorbereiten.
-- laufende_nummer nullable (API-Zeilen haben keine Bank-lfd.-Nr.);
-- external_tx_id + partieller Unique-Index (Dubletten aus wiederholtem Sync).

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS gocardless_institution_id text,
  ADD COLUMN IF NOT EXISTS gocardless_account_id text,
  ADD COLUMN IF NOT EXISTS gocardless_requisition_id text,
  ADD COLUMN IF NOT EXISTS gocardless_agreement_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_gocardless_account_id_key
  ON public.bank_accounts (gocardless_account_id)
  WHERE gocardless_account_id IS NOT NULL;

ALTER TABLE public.bank_transactions
  ALTER COLUMN laufende_nummer DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS external_tx_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_account_ext_tx_key
  ON public.bank_transactions (account_id, external_tx_id)
  WHERE external_tx_id IS NOT NULL;

-- Erhaltener alter Unique-Index (account_id, laufende_nummer) bleibt gültig,
-- weil er nur NOT-NULL-Zeilen prüft — Postgres-Uniques ignorieren NULL.