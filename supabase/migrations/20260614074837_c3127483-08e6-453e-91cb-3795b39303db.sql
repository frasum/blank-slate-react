-- P1-Nachzieher: AFTER INSERT auf locations seedet je neuer Location den
-- vollständigen Kanal-Satz (pos + delivery_souse/wolt/vectron mit
-- is_takeaway korrekt) sowie LDD kitchen=15:00, service=16:00.
-- Behebt strukturelle Lücke in Teil B "je Location vollständiger Satz Kinds
-- beim Seeding": vorher nur einmaliger Backfill, neue Locations blieben leer.
-- Idempotent über ON CONFLICT — sicher für Locations, die schon Kanäle/LDDs
-- haben (z.B. Bestand, vom Backfill versorgt).

CREATE OR REPLACE FUNCTION public.tg_locations_seed_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  -- Vollständiger Kanal-Satz (deterministische sort_order 10/20/30/40).
  INSERT INTO public.revenue_channels
    (organization_id, location_id, label, kind, is_takeaway, sort_order)
  VALUES
    (NEW.organization_id, NEW.id, 'Kasse',   'pos',              false, 10),
    (NEW.organization_id, NEW.id, 'SOUSE',   'delivery_souse',   true,  20),
    (NEW.organization_id, NEW.id, 'Wolt',    'delivery_wolt',    true,  30),
    (NEW.organization_id, NEW.id, 'Vectron', 'delivery_vectron', true,  40)
  ON CONFLICT (organization_id, location_id, kind) DO NOTHING;

  -- LDD: kitchen=15:00, service=16:00 (kein gl-Seed).
  INSERT INTO public.location_department_defaults
    (organization_id, location_id, department, default_checkin)
  VALUES
    (NEW.organization_id, NEW.id, 'kitchen'::public.staff_department, time '15:00'),
    (NEW.organization_id, NEW.id, 'service'::public.staff_department, time '16:00')
  ON CONFLICT (location_id, department) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_locations_seed_defaults ON public.locations;
CREATE TRIGGER tg_locations_seed_defaults
  AFTER INSERT ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_locations_seed_defaults();