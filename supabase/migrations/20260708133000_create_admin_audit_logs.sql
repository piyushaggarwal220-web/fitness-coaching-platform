-- Admin audit log for destructive operations (super_admin only)

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_user_id uuid,
  target_role text,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_id_idx ON admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_performed_by_idx ON admin_audit_logs(performed_by);

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs (audit visibility for operations team)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admins can read admin audit logs'
      AND tablename = 'admin_audit_logs'
  ) THEN
    CREATE POLICY "Admins can read admin audit logs"
      ON admin_audit_logs FOR SELECT
      USING (public.is_platform_admin());
  END IF;
END $$;

-- Inserts performed via service role from server routes only
