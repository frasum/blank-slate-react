-- MA1: session_tip_pool_entries auf DENY-ALL-Client-Write härten
-- (Audit-Matrix §86 P3; Schreibweg ist seit §21 server-only) + Org-FK.
-- IDEMPOTENT: wurde am 14.07. bereits manuell in der Live-DB angewandt —
-- diese Migration zieht die Kette nach und ist auf beiden Zuständen lauffähig.

revoke insert, update, delete on public.session_tip_pool_entries from authenticated;

drop policy if exists "stpe_insert_manager" on public.session_tip_pool_entries;
drop policy if exists "stpe_update_manager" on public.session_tip_pool_entries;
drop policy if exists "stpe_delete_manager" on public.session_tip_pool_entries;
-- SELECT-Policy bleibt unverändert (stpe_select_manager).

alter table public.session_tip_pool_entries
  drop constraint if exists session_tip_pool_entries_organization_id_fkey;
alter table public.session_tip_pool_entries
  add constraint session_tip_pool_entries_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;
