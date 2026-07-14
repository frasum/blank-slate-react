-- N3: Atomares PIN-Rate-Limit. Zählen + Einfügen in einer Funktion,
-- serialisiert per Advisory-Lock je staff_id — schließt das
-- Read-Modify-Write-Fenster der bisherigen count→insert-Sequenz.
-- Rein additiv; ausschließlich service_role darf ausführen.

create or replace function public.pin_attempt_register(
  p_organization_id uuid,
  p_staff_id uuid,
  p_ip text,
  p_window_ms integer,
  p_staff_max integer,
  p_ip_max integer
) returns table (attempt_id uuid, staff_failures integer, ip_failures integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_ms / 1000.0);
  v_id uuid;
  v_staff_count integer;
  v_ip_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('pin_attempt:' || p_staff_id::text));

  select count(*) into v_staff_count
    from pin_attempts
   where staff_id = p_staff_id and attempted_at >= v_since;

  v_ip_count := 0;
  if p_ip is not null then
    select count(*) into v_ip_count
      from pin_attempts
     where ip = p_ip and attempted_at >= v_since;
  end if;

  if v_staff_count >= p_staff_max
     or (p_ip is not null and v_ip_count >= p_ip_max) then
    return query select null::uuid, v_staff_count, v_ip_count;
    return;
  end if;

  insert into pin_attempts (organization_id, staff_id, ip)
       values (p_organization_id, p_staff_id, p_ip)
    returning id into v_id;

  return query select v_id, v_staff_count, v_ip_count;
end
$$;

revoke all on function public.pin_attempt_register(uuid, uuid, text, integer, integer, integer)
  from public, anon, authenticated;
