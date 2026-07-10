
-- ==== Tabellen =========================================================

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  iban text NOT NULL,
  name text NOT NULL,
  location_id uuid REFERENCES public.locations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_accounts_org_iban_unique UNIQUE (organization_id, iban)
);
GRANT SELECT ON public.bank_accounts TO authenticated;
GRANT ALL    ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_accounts_select ON public.bank_accounts;
CREATE POLICY bank_accounts_select ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));
DROP TRIGGER IF EXISTS trg_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


CREATE TABLE IF NOT EXISTS public.bank_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_categories_org_name_unique UNIQUE (organization_id, name)
);
GRANT SELECT ON public.bank_categories TO authenticated;
GRANT ALL    ON public.bank_categories TO service_role;
ALTER TABLE public.bank_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_categories_select ON public.bank_categories;
CREATE POLICY bank_categories_select ON public.bank_categories
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));
DROP TRIGGER IF EXISTS trg_bank_categories_updated_at ON public.bank_categories;
CREATE TRIGGER trg_bank_categories_updated_at
  BEFORE UPDATE ON public.bank_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


CREATE TABLE IF NOT EXISTS public.bank_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid NOT NULL REFERENCES public.bank_categories(id) ON DELETE CASCADE,
  match_field text NOT NULL CHECK (match_field IN ('name','zweck')),
  pattern text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bank_category_rules TO authenticated;
GRANT ALL    ON public.bank_category_rules TO service_role;
ALTER TABLE public.bank_category_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_category_rules_select ON public.bank_category_rules;
CREATE POLICY bank_category_rules_select ON public.bank_category_rules
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));
CREATE INDEX IF NOT EXISTS bank_category_rules_org_prio_idx
  ON public.bank_category_rules (organization_id, priority, id);


CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  laufende_nummer bigint NOT NULL,
  buchungstag date NOT NULL,
  wertstellungstag date,
  betrag_cents bigint NOT NULL,
  saldo_cents bigint,
  gegenpartei text NOT NULL DEFAULT '',
  verwendungszweck text NOT NULL DEFAULT '',
  bank_kategorie text NOT NULL DEFAULT '',
  bank_unterkategorie text NOT NULL DEFAULT '',
  override_category_id uuid REFERENCES public.bank_categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_account_lfd_unique UNIQUE (account_id, laufende_nummer)
);
GRANT SELECT ON public.bank_transactions TO authenticated;
GRANT ALL    ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_transactions_select ON public.bank_transactions;
CREATE POLICY bank_transactions_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));
DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS bank_transactions_org_account_date_idx
  ON public.bank_transactions (organization_id, account_id, buchungstag DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_org_override_idx
  ON public.bank_transactions (organization_id, override_category_id);


-- ==== Seed für YUM ====================================================
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO public.bank_accounts (organization_id, iban, name, location_id)
VALUES ('77838674-26c1-40dd-9b74-eb1041e79b95',
        'DE53700700240052787900',
        'YUM Deutsche Bank',
        '14c2d773-6c5f-4a24-ba00-1c726f277091')
ON CONFLICT (organization_id, iban) DO NOTHING;

INSERT INTO public.bank_categories (organization_id, name, sort_order) VALUES
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Kartenumsatz',10),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Lieferdienste',20),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Bareinzahlung',30),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Sonstige Einnahmen',40),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Löhne & Gehälter (Sammel)',50),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Sozialversicherung',60),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Steuern',70),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Wareneinsatz',80),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Barauszahlung',90),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Energie',100),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Reinigung & Wäsche',110),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Steuerberatung',120),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Versicherungen',130),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Fahrtkosten',140),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Privat / Entnahmen',150),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Spenden',160),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','IT & Software',170),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Personal-Nebenkosten',180),
  ('77838674-26c1-40dd-9b74-eb1041e79b95','Kartengebühren',190)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Regeln (Priorität 100 = default). Duplikate durch Re-Run werden vermieden,
-- indem wir prüfen, ob (category_id, match_field, pattern) schon existiert.
DO $$
DECLARE
  org uuid := '77838674-26c1-40dd-9b74-eb1041e79b95';
  r record;
  rules jsonb := '[
    {"cat":"Kartenumsatz","field":"name","pattern":"First Data"},
    {"cat":"Kartenumsatz","field":"name","pattern":"American Express"},
    {"cat":"Kartenumsatz","field":"name","pattern":"Adyen"},
    {"cat":"Kartenumsatz","field":"name","pattern":"PayPal"},
    {"cat":"Lieferdienste","field":"name","pattern":"WOLT"},
    {"cat":"Bareinzahlung","field":"zweck","pattern":"Einzahlung"},
    {"cat":"Sonstige Einnahmen","field":"name","pattern":"Sebastiansplatz Thai"},
    {"cat":"Sonstige Einnahmen","field":"name","pattern":"TSB-Gast"},
    {"cat":"Löhne & Gehälter (Sammel)","field":"zweck","pattern":"Anzahl Umsätze"},
    {"cat":"Sozialversicherung","field":"name","pattern":"AOK"},
    {"cat":"Sozialversicherung","field":"name","pattern":"Techniker Krankenkasse"},
    {"cat":"Sozialversicherung","field":"name","pattern":"BARMER"},
    {"cat":"Sozialversicherung","field":"name","pattern":"Mobil Krankenkasse"},
    {"cat":"Sozialversicherung","field":"name","pattern":"BKK"},
    {"cat":"Sozialversicherung","field":"name","pattern":"DAK"},
    {"cat":"Sozialversicherung","field":"name","pattern":"Berufsgenossenschaft"},
    {"cat":"Steuern","field":"name","pattern":"Finanzamt"},
    {"cat":"Wareneinsatz","field":"name","pattern":"KAO"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Luigi Rachiero"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Fruechte Feldbrach"},
    {"cat":"Wareneinsatz","field":"name","pattern":"WILHELM MARZ"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Getranke Gratz"},
    {"cat":"Wareneinsatz","field":"name","pattern":"PRIPA"},
    {"cat":"Wareneinsatz","field":"name","pattern":"HOFBRAEUHAUS"},
    {"cat":"Wareneinsatz","field":"name","pattern":"VINOVIT"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Walter + Sohn"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Piana"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Hamberger"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Bürklin-Wolf"},
    {"cat":"Barauszahlung","field":"zweck","pattern":"Auszahlung"},
    {"cat":"Energie","field":"name","pattern":"E.ON"},
    {"cat":"Reinigung & Wäsche","field":"name","pattern":"WAeSCHEREI"},
    {"cat":"Reinigung & Wäsche","field":"name","pattern":"Focus Reinigung"},
    {"cat":"Reinigung & Wäsche","field":"name","pattern":"TOP SERVICE"},
    {"cat":"Steuerberatung","field":"name","pattern":"ETL ADHOGA"},
    {"cat":"Versicherungen","field":"name","pattern":"SIGNAL IDUNA"},
    {"cat":"Fahrtkosten","field":"name","pattern":"Taxi München"},
    {"cat":"Fahrtkosten","field":"name","pattern":"IsarFunk"},
    {"cat":"Privat / Entnahmen","field":"name","pattern":"Frank Schumann"},
    {"cat":"Privat / Entnahmen","field":"name","pattern":"Sumitr Jomsri"},
    {"cat":"Privat / Entnahmen","field":"name","pattern":"Peter Bleyle"},
    {"cat":"Spenden","field":"name","pattern":"Hilf Mahl"},
    {"cat":"IT & Software","field":"name","pattern":"united-domains"},
    {"cat":"IT & Software","field":"name","pattern":"Kassensysteme Geiger"},
    {"cat":"IT & Software","field":"name","pattern":"SimonsVoss"},
    {"cat":"IT & Software","field":"name","pattern":"ZENCHEF"},
    {"cat":"IT & Software","field":"name","pattern":"Telekom"},
    {"cat":"Personal-Nebenkosten","field":"name","pattern":"JobRad"},
    {"cat":"Kartengebühren","field":"name","pattern":"FSDB Merchant"}
  ]'::jsonb;
  cat_id uuid;
BEGIN
  FOR r IN SELECT * FROM jsonb_to_recordset(rules)
              AS x(cat text, field text, pattern text)
  LOOP
    SELECT id INTO cat_id FROM public.bank_categories
     WHERE organization_id = org AND name = r.cat;
    IF cat_id IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.bank_category_rules
       WHERE organization_id = org
         AND category_id = cat_id
         AND match_field = r.field
         AND pattern = r.pattern
    ) THEN
      INSERT INTO public.bank_category_rules
        (organization_id, category_id, match_field, pattern, priority)
      VALUES (org, cat_id, r.field, r.pattern, 100);
    END IF;
  END LOOP;
END $$;
