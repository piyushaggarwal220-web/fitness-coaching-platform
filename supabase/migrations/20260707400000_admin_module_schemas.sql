-- Admin module schemas: purchases oversight, prompt library access, notifications scaffold

-- Purchases: admin read access
CREATE POLICY "Admins can read all purchases"
  ON purchases FOR SELECT
  USING (public.is_platform_admin());

-- AI knowledge: admins can read all entries (including inactive)
CREATE POLICY "Admins can read all ai knowledge"
  ON ai_knowledge FOR SELECT
  USING (public.is_platform_admin());

-- Platform notifications scaffold (admin notifications module)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_notification_channel') THEN
    CREATE TYPE platform_notification_channel AS ENUM ('email', 'in_app', 'sms');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_notification_status') THEN
    CREATE TYPE platform_notification_status AS ENUM ('draft', 'scheduled', 'sent', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  channel platform_notification_channel NOT NULL DEFAULT 'email',
  subject text,
  body text NOT NULL,
  status platform_notification_status NOT NULL DEFAULT 'draft',
  recipient_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  metadata jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_notifications_status_idx ON platform_notifications(status);
CREATE INDEX IF NOT EXISTS platform_notifications_created_at_idx ON platform_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_notifications_recipient_id_idx ON platform_notifications(recipient_id);

ALTER TABLE platform_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read platform notifications"
  ON platform_notifications FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage platform notifications"
  ON platform_notifications FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
