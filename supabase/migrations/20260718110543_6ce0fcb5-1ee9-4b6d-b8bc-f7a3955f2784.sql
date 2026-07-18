-- SEC-02: Policies halten, was ihr Name verspricht — manager+ statt jeder Org-Mitarbeiter.
-- Drops vor Creates (ODER-Falle).

drop policy order_replies_select_manager on public.order_replies;
create policy order_replies_select_manager on public.order_replies
  for select using (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );

drop policy ora_select_manager on public.order_reply_attachments;
create policy ora_select_manager on public.order_reply_attachments
  for select using (
    organization_id = public.current_organization_id()
    and public.has_min_permission('manager')
  );