
-- Realtime channel access: require authentication.
-- Payload rows are additionally filtered by source-table SELECT policies (org-scoped).
DROP POLICY IF EXISTS "realtime_authenticated_only" ON realtime.messages;
CREATE POLICY "realtime_authenticated_only"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
