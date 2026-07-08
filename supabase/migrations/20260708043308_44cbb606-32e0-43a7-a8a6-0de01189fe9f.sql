-- Offene Rechnungen mit Reservierungsname pro Position.
-- Format: [{ "name": "Meier", "cents": 4500 }, ...]
ALTER TABLE public.waiter_settlements
  ADD COLUMN IF NOT EXISTS open_invoices_details jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Validierungs-Trigger (kein CHECK auf Ausdrücken, siehe Projekt-Regel):
-- Jeder Eintrag muss name (nicht leer) + cents (>=0) haben; Summe muss zu
-- open_invoices_cents passen. Leeres Array ist immer erlaubt (Legacy-Rows
-- + Fälle ohne offene Rechnungen).
CREATE OR REPLACE FUNCTION public.tg_waiter_settlements_validate_open_invoices()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_entry jsonb;
  v_name  text;
  v_cents bigint;
  v_sum   bigint := 0;
  v_len   int;
BEGIN
  IF NEW.open_invoices_details IS NULL THEN
    NEW.open_invoices_details := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(NEW.open_invoices_details) <> 'array' THEN
    RAISE EXCEPTION 'open_invoices_details muss ein JSON-Array sein.';
  END IF;

  v_len := jsonb_array_length(NEW.open_invoices_details);
  IF v_len = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(NEW.open_invoices_details) LOOP
    v_name  := btrim(COALESCE(v_entry->>'name', ''));
    v_cents := COALESCE((v_entry->>'cents')::bigint, -1);
    IF v_name = '' THEN
      RAISE EXCEPTION 'Jede offene Rechnung braucht einen Reservierungsnamen.';
    END IF;
    IF v_cents < 0 THEN
      RAISE EXCEPTION 'open_invoices_details[].cents muss >= 0 sein.';
    END IF;
    v_sum := v_sum + v_cents;
  END LOOP;

  IF v_sum <> NEW.open_invoices_cents THEN
    RAISE EXCEPTION 'Summe open_invoices_details (%) stimmt nicht mit open_invoices_cents (%) überein.',
      v_sum, NEW.open_invoices_cents;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_waiter_settlements_validate_open_invoices ON public.waiter_settlements;
CREATE TRIGGER trg_waiter_settlements_validate_open_invoices
BEFORE INSERT OR UPDATE OF open_invoices_details, open_invoices_cents
ON public.waiter_settlements
FOR EACH ROW
EXECUTE FUNCTION public.tg_waiter_settlements_validate_open_invoices();