-- BK1b: Spicery-Bankkonto + zwei Startregeln (idempotent).
INSERT INTO public.bank_accounts (organization_id, iban, name, location_id)
VALUES ('77838674-26c1-40dd-9b74-eb1041e79b95',
        'DE26700700240052787901',
        'Spicery Deutsche Bank',
        '44a99e7e-93be-44b1-89ab-38e364a02ddc')
ON CONFLICT (organization_id, iban) DO NOTHING;

DO $$
DECLARE
  org uuid := '77838674-26c1-40dd-9b74-eb1041e79b95';
  r record;
  rules jsonb := '[
    {"cat":"Steuern","field":"name","pattern":"staatsoberkasse"},
    {"cat":"Wareneinsatz","field":"name","pattern":"Otto Pachmayr"}
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