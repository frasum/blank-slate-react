-- ============================================================================
-- Teil B / M2 Kasse: Policy-Umbau auf has_permission
-- ============================================================================

-- revenue_channels -----------------------------------------------------------
DROP POLICY IF EXISTS "rc_insert_manager" ON public.revenue_channels;
DROP POLICY IF EXISTS "rc_update_manager" ON public.revenue_channels;
DROP POLICY IF EXISTS "rc_delete_admin"   ON public.revenue_channels;

CREATE POLICY "rc_insert_manager" ON public.revenue_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  );

CREATE POLICY "rc_update_manager" ON public.revenue_channels
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  );

CREATE POLICY "rc_delete_admin" ON public.revenue_channels
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  );

-- payment_terminals ---------------------------------------------------------
DROP POLICY IF EXISTS "pt_insert_manager" ON public.payment_terminals;
DROP POLICY IF EXISTS "pt_update_manager" ON public.payment_terminals;
DROP POLICY IF EXISTS "pt_delete_admin"   ON public.payment_terminals;

CREATE POLICY "pt_insert_manager" ON public.payment_terminals
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  );

CREATE POLICY "pt_update_manager" ON public.payment_terminals
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  );

CREATE POLICY "pt_delete_admin" ON public.payment_terminals
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.channel.manage'::public.app_permission, location_id)
  );

-- cash_locks ----------------------------------------------------------------
-- vorher nur SELECT; ergänze CUD über neues Recht cash.session.lock
DROP POLICY IF EXISTS "cash_locks_insert_lock" ON public.cash_locks;
DROP POLICY IF EXISTS "cash_locks_update_lock" ON public.cash_locks;
DROP POLICY IF EXISTS "cash_locks_delete_lock" ON public.cash_locks;

GRANT INSERT, UPDATE, DELETE ON public.cash_locks TO authenticated;

CREATE POLICY "cash_locks_insert_lock" ON public.cash_locks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.session.lock'::public.app_permission, location_id)
  );

CREATE POLICY "cash_locks_update_lock" ON public.cash_locks
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.session.lock'::public.app_permission, location_id)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.session.lock'::public.app_permission, location_id)
  );

CREATE POLICY "cash_locks_delete_lock" ON public.cash_locks
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.session.lock'::public.app_permission, location_id)
  );

-- session_tip_pool_entries -------------------------------------------------
DROP POLICY IF EXISTS "stpe_select_manager" ON public.session_tip_pool_entries;
DROP POLICY IF EXISTS "stpe_insert_manager" ON public.session_tip_pool_entries;
DROP POLICY IF EXISTS "stpe_update_manager" ON public.session_tip_pool_entries;
DROP POLICY IF EXISTS "stpe_delete_manager" ON public.session_tip_pool_entries;

CREATE POLICY "stpe_select_manager" ON public.session_tip_pool_entries
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.tippool.manage'::public.app_permission)
  );

CREATE POLICY "stpe_insert_manager" ON public.session_tip_pool_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.tippool.manage'::public.app_permission)
  );

CREATE POLICY "stpe_update_manager" ON public.session_tip_pool_entries
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.tippool.manage'::public.app_permission)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.tippool.manage'::public.app_permission)
  );

CREATE POLICY "stpe_delete_manager" ON public.session_tip_pool_entries
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('cash.tippool.manage'::public.app_permission)
  );

-- waiter_settlements --------------------------------------------------------
DROP POLICY IF EXISTS "ws_select_own_staff" ON public.waiter_settlements;

CREATE POLICY "ws_select_own_staff" ON public.waiter_settlements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      staff_id = public.current_staff_id()
      OR public.has_permission('cash.settlement.view_all'::public.app_permission)
    )
  );

-- Eigene Abgabe (insert/update) braucht zusätzlich cash.settlement.submit_self
DROP POLICY IF EXISTS "ws_insert_self_today_draft" ON public.waiter_settlements;
CREATE POLICY "ws_insert_self_today_draft" ON public.waiter_settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND staff_id = public.current_staff_id()
    AND status = 'draft'
    AND public.has_permission('cash.settlement.submit_self'::public.app_permission)
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = waiter_settlements.session_id
        AND s.organization_id = waiter_settlements.organization_id
        AND s.business_date = public.current_business_date()
        AND s.status = 'open'
    )
  );

DROP POLICY IF EXISTS "ws_update_self_draft" ON public.waiter_settlements;
CREATE POLICY "ws_update_self_draft" ON public.waiter_settlements
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND status = 'draft'
    AND (
      (staff_id = public.current_staff_id()
        AND public.has_permission('cash.settlement.submit_self'::public.app_permission))
      OR public.has_permission('cash.settlement.correct'::public.app_permission)
    )
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND status = 'draft'
    AND (
      (staff_id = public.current_staff_id()
        AND public.has_permission('cash.settlement.submit_self'::public.app_permission))
      OR public.has_permission('cash.settlement.correct'::public.app_permission)
    )
  );