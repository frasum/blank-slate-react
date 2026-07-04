-- TA2: Telegram-Ping-Empfänger für Schichttausch (analog receives_daily_report).
ALTER TABLE public.staff_telegram_links
  ADD COLUMN IF NOT EXISTS receives_swap_alerts boolean NOT NULL DEFAULT false;

-- TA2: Atomarer Vollzug des Schichttauschs. Muster analog replace_bilanz_year:
-- SECURITY DEFINER, EXECUTE ausschließlich für service_role. Der Unique-Index
-- (staff_id, location_id, shift_date, area) auf roster_shifts erzwingt, dass
-- Slot-Kollisionen die Transaktion komplett zurückrollen — kein Halbtausch.
CREATE OR REPLACE FUNCTION public.execute_shift_swap(p_request_id uuid, p_decided_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  req record;
  v_updated integer;
BEGIN
  SELECT id, shift_id, peer_shift_id, requester_staff_id, peer_staff_id, status
    INTO req
    FROM public.shift_swap_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden.', p_request_id;
  END IF;
  IF req.status <> 'peer_accepted' THEN
    RAISE EXCEPTION 'Anfrage % ist nicht im Status peer_accepted (aktuell: %).', p_request_id, req.status;
  END IF;
  IF req.peer_staff_id IS NULL THEN
    RAISE EXCEPTION 'Anfrage % hat keinen Peer.', p_request_id;
  END IF;

  -- Übernahme: Schicht des Anfragenden geht an den Peer.
  UPDATE public.roster_shifts
     SET staff_id = req.peer_staff_id
   WHERE id = req.shift_id
     AND staff_id = req.requester_staff_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Schicht des Anfragenden nicht mehr in erwartetem Zustand.';
  END IF;

  -- Echter Tausch: Gegenschicht geht an den Anfragenden.
  IF req.peer_shift_id IS NOT NULL THEN
    UPDATE public.roster_shifts
       SET staff_id = req.requester_staff_id
     WHERE id = req.peer_shift_id
       AND staff_id = req.peer_staff_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Gegenschicht nicht mehr in erwartetem Zustand.';
    END IF;
  END IF;

  UPDATE public.shift_swap_requests
     SET status = 'approved',
         decided_at = now(),
         decided_by = p_decided_by
   WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_shift_swap(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.execute_shift_swap(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.execute_shift_swap(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_shift_swap(uuid, uuid) TO service_role;