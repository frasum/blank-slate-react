-- create_task
CREATE OR REPLACE FUNCTION public.create_task(
  p_location_id uuid, p_title text, p_description text,
  p_category public.task_category, p_priority smallint DEFAULT 0,
  p_due_at timestamptz DEFAULT NULL, p_assignee_staff_id uuid DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := public.current_staff_id();
  v_org uuid := public.current_organization_id();
  v_role text := public.current_role()::text;
  v_sort numeric;
  v_task public.tasks;
begin
  if v_caller is null or v_org is null then
    raise exception 'kein aktiver Aufrufer/Organisation';
  end if;
  if not exists (select 1 from public.locations where id = p_location_id and organization_id = v_org) then
    raise exception 'location % nicht in aktiver Organisation', p_location_id;
  end if;
  if v_role = 'staff' and p_category = 'manager_admin' then
    raise exception 'Kategorie manager_admin ist für Staff nicht erlaubt';
  end if;
  if p_assignee_staff_id is not null and not exists (
    select 1 from public.staff_locations
     where staff_id = p_assignee_staff_id and location_id = p_location_id and organization_id = v_org
  ) then
    raise exception 'Assignee % arbeitet nicht an Standort %', p_assignee_staff_id, p_location_id;
  end if;

  select coalesce(max(sort_order), 0) + 1
    into v_sort
    from public.tasks
   where location_id = p_location_id and status = 'open' and archived_at is null;

  insert into public.tasks (organization_id, location_id, title, description, category, priority,
                            sort_order, due_at, created_by_staff_id, assignee_staff_id, status)
  values (v_org, p_location_id, p_title, p_description, p_category, coalesce(p_priority, 0),
          v_sort, p_due_at, v_caller, p_assignee_staff_id, 'open')
  returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.create_task(uuid,text,text,public.task_category,smallint,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_task(uuid,text,text,public.task_category,smallint,timestamptz,uuid) TO service_role;

-- set_task_status
CREATE OR REPLACE FUNCTION public.set_task_status(
  p_task_id uuid, p_new_status public.task_status, p_sort_order numeric DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_task public.tasks; v_now timestamptz := now(); v_caller uuid := public.current_staff_id();
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> public.current_organization_id() then
    raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (
    public.is_admin()
    or public.has_permission('tasks.change_status'::public.app_permission)
    or v_task.assignee_staff_id = v_caller
  ) then raise exception 'keine Berechtigung, Status von task % zu ändern', p_task_id; end if;

  if v_task.status = p_new_status and p_sort_order is null then return v_task; end if;

  if v_task.status <> p_new_status and not (
    (v_task.status = 'open'        and p_new_status in ('in_progress','cancelled')) or
    (v_task.status = 'in_progress' and p_new_status in ('open','done','cancelled')) or
    (v_task.status = 'done'        and p_new_status = 'open') or
    (v_task.status = 'cancelled'   and p_new_status = 'open')
  ) then raise exception 'ungültiger Status-Übergang: % → %', v_task.status, p_new_status; end if;

  update public.tasks set
    status       = p_new_status,
    sort_order   = coalesce(p_sort_order, sort_order),
    started_at   = case when p_new_status='in_progress' and started_at   is null then v_now else started_at   end,
    completed_at = case when p_new_status='done'        and completed_at is null then v_now else completed_at end
  where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.set_task_status(uuid, public.task_status, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_status(uuid, public.task_status, numeric) TO service_role;

-- reassign_task
CREATE OR REPLACE FUNCTION public.reassign_task(p_task_id uuid, p_new_assignee_staff_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_task public.tasks; v_caller uuid := public.current_staff_id(); v_org uuid := public.current_organization_id();
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> v_org then raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (
    public.is_admin()
    or public.has_permission('tasks.assign'::public.app_permission)
    or (v_task.assignee_staff_id = v_caller and exists (
          select 1 from public.staff_locations
           where staff_id = p_new_assignee_staff_id and location_id = v_task.location_id and organization_id = v_org))
  ) then raise exception 'keine Berechtigung, task % neu zuzuweisen', p_task_id; end if;
  if not exists (select 1 from public.staff_locations
     where staff_id = p_new_assignee_staff_id and location_id = v_task.location_id and organization_id = v_org) then
    raise exception 'Assignee % arbeitet nicht an Standort der Task', p_new_assignee_staff_id; end if;

  update public.tasks set assignee_staff_id = p_new_assignee_staff_id where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.reassign_task(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_task(uuid, uuid) TO service_role;

-- update_task
CREATE OR REPLACE FUNCTION public.update_task(
  p_task_id uuid, p_title text, p_description text, p_priority smallint, p_due_at timestamptz
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_task public.tasks; v_org uuid := public.current_organization_id();
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> v_org then raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (
    public.is_admin()
    or (public.has_min_permission('manager'::public.app_role)
        and v_task.location_id in (select location_id from public.staff_locations where staff_id = public.current_staff_id()))
  ) then raise exception 'keine Berechtigung, task % zu bearbeiten', p_task_id; end if;

  update public.tasks
     set title = p_title, description = p_description,
         priority = coalesce(p_priority, priority), due_at = p_due_at
   where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.update_task(uuid, text, text, smallint, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_task(uuid, text, text, smallint, timestamptz) TO service_role;

-- archive_task
CREATE OR REPLACE FUNCTION public.archive_task(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_task public.tasks; v_org uuid := public.current_organization_id();
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> v_org then raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (
    public.is_admin()
    or (public.has_permission('tasks.delete'::public.app_permission)
        and v_task.location_id in (select location_id from public.staff_locations where staff_id = public.current_staff_id()))
  ) then raise exception 'keine Berechtigung, task % zu archivieren', p_task_id; end if;

  update public.tasks set archived_at = now() where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.archive_task(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_task(uuid) TO service_role;