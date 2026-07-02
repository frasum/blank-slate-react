-- Audit Phase 2 (korrigiert): Bestelleinheiten-Rückbau + 2 verwaiste Functions.
alter table public.articles drop column if exists order_unit_id;
drop table if exists public.order_units;
drop function if exists public.effective_permissions(uuid);
drop function if exists public.has_role(public.app_role);