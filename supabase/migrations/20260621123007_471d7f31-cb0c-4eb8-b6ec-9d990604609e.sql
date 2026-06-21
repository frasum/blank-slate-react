DROP FUNCTION IF EXISTS public.create_task(uuid,text,text,public.task_category,smallint,timestamptz,uuid);
DROP FUNCTION IF EXISTS public.set_task_status(uuid, public.task_status, numeric);
DROP FUNCTION IF EXISTS public.reassign_task(uuid, uuid);
DROP FUNCTION IF EXISTS public.update_task(uuid, text, text, smallint, timestamptz);
DROP FUNCTION IF EXISTS public.archive_task(uuid);
DROP FUNCTION IF EXISTS public.claim_task(uuid);

CREATE FUNCTION public.create_task(
  p_caller_staff_id uuid, p_organization_id uuid,
  p_location_id uuid, p_title text, p_description text,
  p_category public.task_category, p_priority smallint DEFAULT 0,
  p_due_at timestamptz DEFAULT NULL, p_assignee_staff_id uuid DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_role public.app_role := (select role from public.role_assignments
    where staff_id = p_caller_staff_id and organization_id = p_organization_id);
  v_sort numeric; v_task public.tasks;
begin
  if p_caller_staff_id is null or p_organization_id is null or v_role is null then
    raise exception 'kein aktiver Aufrufer/Organisation'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and organization_id = p_organization_id) then
    raise exception 'location % nicht in aktiver Organisation', p_location_id; end if;
  if v_role = 'staff' and p_category = 'manager_admin' then
    raise exception 'Kategorie manager_admin ist für Staff nicht erlaubt'; end if;
  if p_assignee_staff_id is not null and not exists (
    select 1 from public.staff_locations
    where staff_id = p_assignee_staff_id and location_id = p_location_id and organization_id = p_organization_id
  ) then raise exception 'Assignee % arbeitet nicht an Standort %', p_assignee_staff_id, p_location_id; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.tasks where location_id = p_location_id and status = 'open' and archived_at is null;
  insert into public.tasks (organization_id, location_id, title, description, category, priority,
                            sort_order, due_at, created_by_staff_id, assignee_staff_id, status)
  values (p_organization_id, p_location_id, p_title, p_description, p_category, coalesce(p_priority, 0),
          v_sort, p_due_at, p_caller_staff_id, p_assignee_staff_id, 'open')
  returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.create_task(uuid,uuid,uuid,text,text,public.task_category,smallint,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_task(uuid,uuid,uuid,text,text,public.task_category,smallint,timestamptz,uuid) TO service_role;

CREATE FUNCTION public.set_task_status(
  p_caller_staff_id uuid, p_organization_id uuid,
  p_task_id uuid, p_new_status public.task_status, p_sort_order numeric DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks; v_now timestamptz := now();
  v_role public.app_role := (select role from public.role_assignments
    where staff_id = p_caller_staff_id and organization_id = p_organization_id);
begin
  if p_caller_staff_id is null or p_organization_id is null or v_role is null then
    raise exception 'kein aktiver Aufrufer/Organisation'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> p_organization_id then
    raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (v_role in ('admin','manager') or v_task.assignee_staff_id = p_caller_staff_id) then
    raise exception 'keine Berechtigung, Status von task % zu ändern', p_task_id; end if;
  if v_task.status = p_new_status and p_sort_order is null then return v_task; end if;
  if v_task.status <> p_new_status and not (
    (v_task.status = 'open'        and p_new_status in ('in_progress','cancelled')) or
    (v_task.status = 'in_progress' and p_new_status in ('open','done','cancelled')) or
    (v_task.status = 'done'        and p_new_status = 'open') or
    (v_task.status = 'cancelled'   and p_new_status = 'open')
  ) then raise exception 'ungültiger Status-Übergang: % → %', v_task.status, p_new_status; end if;
  update public.tasks set
    status = p_new_status,
    sort_order = coalesce(p_sort_order, sort_order),
    started_at = case when p_new_status='in_progress' and started_at is null then v_now else started_at end,
    completed_at = case when p_new_status='done' and completed_at is null then v_now else completed_at end
  where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.set_task_status(uuid,uuid,uuid,public.task_status,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_status(uuid,uuid,uuid,public.task_status,numeric) TO service_role;

CREATE FUNCTION public.reassign_task(
  p_caller_staff_id uuid, p_organization_id uuid,
  p_task_id uuid, p_new_assignee_staff_id uuid
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks;
  v_role public.app_role := (select role from public.role_assignments
    where staff_id = p_caller_staff_id and organization_id = p_organization_id);
begin
  if p_caller_staff_id is null or p_organization_id is null or v_role is null then
    raise exception 'kein aktiver Aufrufer/Organisation'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> p_organization_id then
    raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (
    v_role in ('admin','manager')
    or (v_task.assignee_staff_id = p_caller_staff_id and exists (
      select 1 from public.staff_locations
      where staff_id = p_new_assignee_staff_id and location_id = v_task.location_id and organization_id = p_organization_id))
  ) then raise exception 'keine Berechtigung, task % neu zuzuweisen', p_task_id; end if;
  if not exists (select 1 from public.staff_locations
    where staff_id = p_new_assignee_staff_id and location_id = v_task.location_id and organization_id = p_organization_id) then
    raise exception 'Assignee % arbeitet nicht an Standort der Task', p_new_assignee_staff_id; end if;
  update public.tasks set assignee_staff_id = p_new_assignee_staff_id where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.reassign_task(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_task(uuid,uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.update_task(
  p_caller_staff_id uuid, p_organization_id uuid,
  p_task_id uuid, p_title text, p_description text, p_priority smallint, p_due_at timestamptz
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks;
  v_role public.app_role := (select role from public.role_assignments
    where staff_id = p_caller_staff_id and organization_id = p_organization_id);
begin
  if p_caller_staff_id is null or p_organization_id is null or v_role is null then
    raise exception 'kein aktiver Aufrufer/Organisation'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> p_organization_id then
    raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if not (
    v_role = 'admin'
    or (v_role = 'manager'
        and v_task.location_id in (select location_id from public.staff_locations where staff_id = p_caller_staff_id))
  ) then raise exception 'keine Berechtigung, task % zu bearbeiten', p_task_id; end if;
  update public.tasks
     set title = p_title, description = p_description,
         priority = coalesce(p_priority, priority), due_at = p_due_at
   where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.update_task(uuid,uuid,uuid,text,text,smallint,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_task(uuid,uuid,uuid,text,text,smallint,timestamptz) TO service_role;

CREATE FUNCTION public.archive_task(
  p_caller_staff_id uuid, p_organization_id uuid, p_task_id uuid
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks;
  v_role public.app_role := (select role from public.role_assignments
    where staff_id = p_caller_staff_id and organization_id = p_organization_id);
begin
  if p_caller_staff_id is null or p_organization_id is null or v_role is null then
    raise exception 'kein aktiver Aufrufer/Organisation'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> p_organization_id then
    raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if v_role <> 'admin' then
    raise exception 'keine Berechtigung, task % zu archivieren', p_task_id; end if;
  update public.tasks set archived_at = now() where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.archive_task(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_task(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.claim_task(
  p_caller_staff_id uuid, p_organization_id uuid, p_task_id uuid
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_task public.tasks;
begin
  if p_caller_staff_id is null or p_organization_id is null then
    raise exception 'kein aktiver Aufrufer/Organisation'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'task % nicht gefunden', p_task_id; end if;
  if v_task.organization_id <> p_organization_id then
    raise exception 'task % gehört nicht zur aktiven Organisation', p_task_id; end if;
  if v_task.archived_at is not null then raise exception 'task % ist archiviert', p_task_id; end if;
  if v_task.status <> 'open' then raise exception 'task % ist nicht offen (Status: %)', p_task_id, v_task.status; end if;
  if v_task.assignee_staff_id is not null then raise exception 'task % ist bereits zugewiesen', p_task_id; end if;
  if not exists (select 1 from public.staff_locations
    where staff_id = p_caller_staff_id and location_id = v_task.location_id and organization_id = p_organization_id) then
    raise exception 'Aufrufer arbeitet nicht an Standort der Task'; end if;
  update public.tasks set assignee_staff_id = p_caller_staff_id where id = p_task_id returning * into v_task;
  return v_task;
end; $function$;
REVOKE ALL ON FUNCTION public.claim_task(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid,uuid,uuid) TO service_role;