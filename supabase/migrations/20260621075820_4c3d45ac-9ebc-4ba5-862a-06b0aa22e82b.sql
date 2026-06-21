-- Phase 2: Staff-Sichtbarkeit + claim_task
-- 1) SELECT-Policy für staff: nur Aufgaben aktiver, nicht-archivierter Tasks
--    an Standorten, an denen der Aufrufer arbeitet (staff_locations).
-- 2) RPC claim_task: weist offene, unassignete Task dem aufrufenden Staff zu.

-- 1) RLS-Policy für staff
DROP POLICY IF EXISTS tasks_select_staff_for_location ON public.tasks;
CREATE POLICY tasks_select_staff_for_location
ON public.tasks
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND organization_id = public.current_organization_id()
  AND EXISTS (
    SELECT 1 FROM public.staff_locations sl
    WHERE sl.staff_id = public.current_staff_id()
      AND sl.location_id = public.tasks.location_id
      AND sl.organization_id = public.tasks.organization_id
  )
);

-- 2) claim_task RPC
CREATE OR REPLACE FUNCTION public.claim_task(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks;
  v_caller uuid := public.current_staff_id();
  v_org uuid := public.current_organization_id();
BEGIN
  IF v_caller IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'kein aktiver Aufrufer/Organisation';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'task % nicht gefunden', p_task_id;
  END IF;
  IF v_task.organization_id <> v_org THEN
    RAISE EXCEPTION 'task % gehört nicht zur aktiven Organisation', p_task_id;
  END IF;
  IF v_task.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'task % ist archiviert', p_task_id;
  END IF;
  IF v_task.status <> 'open' THEN
    RAISE EXCEPTION 'task % ist nicht offen (Status: %)', p_task_id, v_task.status;
  END IF;
  IF v_task.assignee_staff_id IS NOT NULL THEN
    RAISE EXCEPTION 'task % ist bereits zugewiesen', p_task_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_locations
    WHERE staff_id = v_caller
      AND location_id = v_task.location_id
      AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Aufrufer arbeitet nicht an Standort der Task';
  END IF;

  UPDATE public.tasks
     SET assignee_staff_id = v_caller
   WHERE id = p_task_id
   RETURNING * INTO v_task;
  RETURN v_task;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid) TO authenticated;