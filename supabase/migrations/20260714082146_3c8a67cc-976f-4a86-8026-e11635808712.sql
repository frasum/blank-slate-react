-- FK1: FK-Indizes (Inventur 13.07.2026). Ausnahme: organization_id-FKs
-- bewusst ohne Index (ein Mandant, keine Selektivität — SaaS-Spur).

-- Große / wachsende Tabellen
create index if not exists idx_time_entries_location_id on public.time_entries (location_id);
create index if not exists idx_roster_shifts_location_id on public.roster_shifts (location_id);
create index if not exists idx_roster_shifts_skill_id on public.roster_shifts (skill_id);
create index if not exists idx_articles_supplier_id on public.articles (supplier_id);
create index if not exists idx_bank_transactions_override_category_id on public.bank_transactions (override_category_id);
create index if not exists idx_session_tip_pool_entries_staff_id on public.session_tip_pool_entries (staff_id);
create index if not exists idx_waiter_settlements_staff_id on public.waiter_settlements (staff_id);
create index if not exists idx_waiter_settlements_partner_staff_id on public.waiter_settlements (partner_staff_id);
create index if not exists idx_waiter_settlements_corrected_from_id on public.waiter_settlements (corrected_from_id);
create index if not exists idx_waiter_settlements_auto_clockout_time_entry_id on public.waiter_settlements (auto_clockout_time_entry_id);
create index if not exists idx_session_channel_amounts_channel_id on public.session_channel_amounts (channel_id);
create index if not exists idx_session_terminal_amounts_terminal_id on public.session_terminal_amounts (terminal_id);
create index if not exists idx_order_items_article_id on public.order_items (article_id);

-- Kasse / Sessions
create index if not exists idx_sessions_location_id on public.sessions (location_id);
create index if not exists idx_sessions_finalized_by on public.sessions (finalized_by);
create index if not exists idx_sessions_locked_by on public.sessions (locked_by);
create index if not exists idx_session_advances_staff_id on public.session_advances (staff_id);
create index if not exists idx_session_card_transactions_terminal_id on public.session_card_transactions (terminal_id);
create index if not exists idx_cash_locks_location_id on public.cash_locks (location_id);
create index if not exists idx_cash_locks_updated_by on public.cash_locks (updated_by);
create index if not exists idx_settlement_partners_staff_id on public.settlement_partners (staff_id);

-- Bestellwesen / Inventur
create index if not exists idx_orders_location_id on public.orders (location_id);
create index if not exists idx_orders_supplier_id on public.orders (supplier_id);
create index if not exists idx_carts_location_id on public.carts (location_id);
create index if not exists idx_carts_user_id on public.carts (user_id);
create index if not exists idx_cart_items_article_id on public.cart_items (article_id);
create index if not exists idx_cart_items_supplier_id on public.cart_items (supplier_id);
create index if not exists idx_cart_drafts_location_id on public.cart_drafts (location_id);
create index if not exists idx_cart_drafts_user_id on public.cart_drafts (user_id);
create index if not exists idx_cart_draft_items_article_id on public.cart_draft_items (article_id);
create index if not exists idx_cart_draft_items_supplier_id on public.cart_draft_items (supplier_id);
create index if not exists idx_inventory_sessions_location_id on public.inventory_sessions (location_id);
create index if not exists idx_inventory_sessions_user_id on public.inventory_sessions (user_id);
create index if not exists idx_staff_easyorder_access_location_id on public.staff_easyorder_access (location_id);
create index if not exists idx_staff_easyorder_suppliers_location_id on public.staff_easyorder_suppliers (location_id);
create index if not exists idx_staff_easyorder_suppliers_supplier_id on public.staff_easyorder_suppliers (supplier_id);

-- Personal / Dienstplan / Lohn
create index if not exists idx_leave_requests_decided_by_staff_id on public.leave_requests (decided_by_staff_id);
create index if not exists idx_shift_swap_requests_requester_staff_id on public.shift_swap_requests (requester_staff_id);
create index if not exists idx_shift_swap_requests_peer_staff_id on public.shift_swap_requests (peer_staff_id);
create index if not exists idx_shift_swap_requests_peer_shift_id on public.shift_swap_requests (peer_shift_id);
create index if not exists idx_shift_swap_requests_decided_by on public.shift_swap_requests (decided_by);
create index if not exists idx_roster_releases_period_id on public.roster_releases (period_id);
create index if not exists idx_roster_releases_released_by on public.roster_releases (released_by);
create index if not exists idx_staff_documents_staff_id on public.staff_documents (staff_id);
create index if not exists idx_staff_documents_uploaded_by on public.staff_documents (uploaded_by);
create index if not exists idx_staff_documents_verified_by on public.staff_documents (verified_by);
create index if not exists idx_generated_documents_staff_id on public.generated_documents (staff_id);
create index if not exists idx_generated_documents_created_by on public.generated_documents (created_by);
create index if not exists idx_generated_documents_template_id on public.generated_documents (template_id);
create index if not exists idx_staff_data_change_requests_reviewed_by on public.staff_data_change_requests (reviewed_by);
create index if not exists idx_staff_identity_map_staff_id on public.staff_identity_map (staff_id);
create index if not exists idx_payroll_notes_location_id on public.payroll_notes (location_id);
create index if not exists idx_sofortmeldung_reported_by on public.sofortmeldung (reported_by);

-- Tasks / Sonstiges
create index if not exists idx_tasks_assignee_staff_id on public.tasks (assignee_staff_id);
create index if not exists idx_tasks_created_by_staff_id on public.tasks (created_by_staff_id);
create index if not exists idx_tasks_location_id on public.tasks (location_id);
create index if not exists idx_task_photos_uploaded_by_staff_id on public.task_photos (uploaded_by_staff_id);
create index if not exists idx_ki_usage_log_staff_id on public.ki_usage_log (staff_id);
create index if not exists idx_wine_quiz_scores_staff_id on public.wine_quiz_scores (staff_id);
create index if not exists idx_admin_impersonations_target_staff_id on public.admin_impersonations (target_staff_id);
create index if not exists idx_permission_overrides_location_id on public.permission_overrides (location_id);
create index if not exists idx_bank_category_rules_category_id on public.bank_category_rules (category_id);
create index if not exists idx_bank_accounts_location_id on public.bank_accounts (location_id);
create index if not exists idx_revenue_channels_location_id on public.revenue_channels (location_id);
create index if not exists idx_payment_terminals_location_id on public.payment_terminals (location_id);
create index if not exists idx_display_reminders_location_id on public.display_reminders (location_id);
