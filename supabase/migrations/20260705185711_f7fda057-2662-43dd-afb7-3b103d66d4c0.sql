drop policy if exists "settlement_partners_select" on public.settlement_partners;
create policy "settlement_partners_select"
  on public.settlement_partners
  for select
  to authenticated
  using (organization_id = public.current_organization_id());