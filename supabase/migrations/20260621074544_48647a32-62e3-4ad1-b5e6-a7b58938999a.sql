DO $$ BEGIN
  CREATE TYPE public.task_category AS ENUM ('service','kitchen','maintenance','manager_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('open','in_progress','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES public.locations(id)      ON DELETE CASCADE,
  title            text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description      text,
  category         public.task_category NOT NULL,
  status           public.task_status   NOT NULL DEFAULT 'open',
  priority         smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
  sort_order       numeric NOT NULL DEFAULT 0,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  assignee_staff_id   uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  due_at           timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  archived_at      timestamptz,
  escalate_at      timestamptz,
  escalated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_completed_consistency CHECK (
    (status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done')),
  CONSTRAINT tasks_inprogress_consistency CHECK (
    (status = 'in_progress' AND started_at IS NOT NULL) OR (status <> 'in_progress'))
);

CREATE INDEX IF NOT EXISTS tasks_active_board_idx ON public.tasks (organization_id, location_id, status, sort_order)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_org_loc_category_idx ON public.tasks (organization_id, location_id, category);
CREATE INDEX IF NOT EXISTS tasks_org_assignee_idx     ON public.tasks (organization_id, assignee_staff_id, status)
  WHERE assignee_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_org_due_idx          ON public.tasks (organization_id, due_at)
  WHERE due_at IS NOT NULL AND status NOT IN ('done','cancelled') AND archived_at IS NULL;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT ON public.tasks TO authenticated;
GRANT ALL    ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select_admin_or_manager ON public.tasks;
CREATE POLICY tasks_select_admin_or_manager ON public.tasks
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      public.is_admin()
      OR (
        public.has_min_permission('manager'::public.app_role)
        AND location_id IN (
          select location_id from public.staff_locations
           where staff_id = public.current_staff_id()
        )
      )
    )
  );