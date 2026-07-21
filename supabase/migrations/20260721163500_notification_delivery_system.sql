-- Durable, cost-aware multi-channel notification delivery.
CREATE SCHEMA IF NOT EXISTS private;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_priority') THEN
    CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE notification_channel AS ENUM ('in_app', 'web_push', 'email', 'whatsapp');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_job_state') THEN
    CREATE TYPE notification_job_state AS ENUM (
      'queued', 'claimed', 'sent', 'delivered', 'failed', 'cancelled', 'dead_letter'
    );
  END IF;
END $$;

CREATE TABLE notification_channel_policies (
  event_type notification_type PRIMARY KEY,
  priority notification_priority NOT NULL DEFAULT 'normal',
  immediate_channels notification_channel[] NOT NULL DEFAULT ARRAY['in_app','web_push']::notification_channel[],
  escalation_channels notification_channel[] NOT NULL DEFAULT '{}'::notification_channel[],
  escalation_delay_minutes integer NOT NULL DEFAULT 180 CHECK (escalation_delay_minutes >= 0),
  digest_window_minutes integer NOT NULL DEFAULT 0 CHECK (digest_window_minutes >= 0),
  whatsapp_daily_cap integer NOT NULL DEFAULT 1 CHECK (whatsapp_daily_cap >= 0),
  whatsapp_weekly_cap integer NOT NULL DEFAULT 3 CHECK (whatsapp_weekly_cap >= 0),
  critical_exception boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO notification_channel_policies
  (event_type, priority, immediate_channels, escalation_channels, escalation_delay_minutes, digest_window_minutes, critical_exception)
VALUES
  ('coach_replied', 'normal', ARRAY['in_app','web_push']::notification_channel[], ARRAY[]::notification_channel[], 720, 30, false),
  ('unread_chat', 'normal', ARRAY['in_app','web_push']::notification_channel[], ARRAY['whatsapp']::notification_channel[], 720, 30, false),
  ('plan_delivered', 'high', ARRAY['in_app','web_push']::notification_channel[], ARRAY['whatsapp','email']::notification_channel[], 180, 0, false),
  ('plan_available', 'high', ARRAY['in_app','web_push']::notification_channel[], ARRAY['whatsapp','email']::notification_channel[], 180, 0, false),
  ('weekly_checkin_reminder', 'normal', ARRAY['in_app','web_push']::notification_channel[], ARRAY[]::notification_channel[], 360, 0, false),
  ('mid_week_checkin_reminder', 'normal', ARRAY['in_app','web_push']::notification_channel[], ARRAY[]::notification_channel[], 360, 0, false),
  ('missed_checkin', 'high', ARRAY['in_app','web_push']::notification_channel[], ARRAY['whatsapp']::notification_channel[], 240, 0, false),
  ('onboarding_reminder', 'high', ARRAY['in_app','web_push']::notification_channel[], ARRAY['email','whatsapp']::notification_channel[], 360, 0, false),
  ('photo_reminder', 'normal', ARRAY['in_app','web_push']::notification_channel[], ARRAY['email']::notification_channel[], 720, 0, false),
  ('call_requested', 'high', ARRAY['in_app','web_push']::notification_channel[], ARRAY[]::notification_channel[], 180, 0, false),
  ('call_request_updated', 'high', ARRAY['in_app','web_push']::notification_channel[], ARRAY[]::notification_channel[], 180, 0, false)
ON CONFLICT (event_type) DO UPDATE SET
  priority = EXCLUDED.priority,
  immediate_channels = EXCLUDED.immediate_channels,
  escalation_channels = EXCLUDED.escalation_channels,
  escalation_delay_minutes = EXCLUDED.escalation_delay_minutes,
  digest_window_minutes = EXCLUDED.digest_window_minutes;

CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  web_push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  expires_at timestamptz,
  disabled_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE TABLE notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_role text NOT NULL CHECK (recipient_role IN ('client','coach','admin','super_admin')),
  event_type notification_type NOT NULL,
  priority notification_priority NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  digest_key text,
  in_app_notification_id uuid REFERENCES user_notifications(id) ON DELETE SET NULL,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_role text NOT NULL,
  channel notification_channel NOT NULL,
  state notification_job_state NOT NULL DEFAULT 'queued',
  priority notification_priority NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claim_token uuid,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  escalation_reason text,
  estimated_cost_micros bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, channel)
);

CREATE TABLE notification_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  state notification_job_state NOT NULL,
  provider text,
  provider_message_id text,
  response_code text,
  error text,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_budget_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  whatsapp_monthly_cap integer NOT NULL DEFAULT 1000 CHECK (whatsapp_monthly_cap >= 0),
  whatsapp_estimated_unit_cost_micros bigint NOT NULL DEFAULT 900000 CHECK (whatsapp_estimated_unit_cost_micros >= 0),
  dead_letter_alert_threshold integer NOT NULL DEFAULT 10 CHECK (dead_letter_alert_threshold > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO notification_budget_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE notification_drain_leases (
  lease_name text PRIMARY KEY,
  available_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS delivery_event_id uuid REFERENCES notification_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_delivery_event_idx
  ON user_notifications (delivery_event_id) WHERE delivery_event_id IS NOT NULL;

CREATE INDEX notification_jobs_claim_idx
  ON notification_jobs (priority DESC, next_attempt_at, created_at)
  WHERE state IN ('queued','failed','claimed');
CREATE INDEX notification_jobs_user_channel_idx ON notification_jobs (user_id, channel, sent_at DESC);
CREATE INDEX notification_events_user_created_idx ON notification_events (user_id, created_at DESC);
CREATE INDEX notification_attempts_job_idx ON notification_attempts (job_id, created_at);
CREATE INDEX push_subscriptions_user_active_idx ON push_subscriptions (user_id) WHERE disabled_at IS NULL;

ALTER TABLE notification_channel_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_drain_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification preferences" ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notification preferences" ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notification preferences" ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read notification policies" ON notification_channel_policies FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY "Admins manage notification policies" ON notification_channel_policies FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Admins read notification events" ON notification_events FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY "Admins read notification jobs" ON notification_jobs FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY "Admins read notification attempts" ON notification_attempts FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY "Admins manage notification budget" ON notification_budget_settings FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

REVOKE ALL ON notification_events, notification_jobs, notification_attempts,
  notification_budget_settings, notification_drain_leases FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_user_id uuid,
  p_event_type notification_type,
  p_title text,
  p_body text,
  p_action_url text,
  p_metadata jsonb,
  p_idempotency_key text,
  p_priority notification_priority DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
  v_role text;
  v_policy notification_channel_policies%ROWTYPE;
  v_channel notification_channel;
  v_delay integer;
  v_cost bigint;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Recipient profile not found'; END IF;
  SELECT * INTO v_policy FROM notification_channel_policies WHERE event_type = p_event_type AND enabled;
  IF NOT FOUND THEN
    v_policy.priority := COALESCE(p_priority, 'normal');
    v_policy.immediate_channels := ARRAY['in_app','web_push']::notification_channel[];
    v_policy.escalation_channels := ARRAY[]::notification_channel[];
    v_policy.escalation_delay_minutes := 180;
    v_policy.digest_window_minutes := 0;
  END IF;

  INSERT INTO notification_events
    (user_id, recipient_role, event_type, priority, title, body, action_url, metadata, idempotency_key, digest_key)
  VALUES
    (p_user_id, v_role, p_event_type, COALESCE(p_priority, v_policy.priority), p_title, p_body,
     p_action_url, COALESCE(p_metadata, '{}'::jsonb), p_idempotency_key,
     CASE WHEN v_policy.digest_window_minutes > 0
       THEN p_user_id || ':' || p_event_type::text || ':' ||
         floor(extract(epoch FROM now()) / (v_policy.digest_window_minutes * 60))::text
       ELSE NULL END)
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_event_id;

  FOREACH v_channel IN ARRAY v_policy.immediate_channels LOOP
    INSERT INTO notification_jobs
      (event_id, user_id, recipient_role, channel, priority, next_attempt_at, idempotency_key)
    VALUES
      (v_event_id, p_user_id, v_role, v_channel, COALESCE(p_priority, v_policy.priority), now(),
       p_idempotency_key || ':' || v_channel::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  FOREACH v_channel IN ARRAY v_policy.escalation_channels LOOP
    v_delay := v_policy.escalation_delay_minutes;
    SELECT whatsapp_estimated_unit_cost_micros INTO v_cost
      FROM notification_budget_settings WHERE singleton;
    INSERT INTO notification_jobs
      (event_id, user_id, recipient_role, channel, priority, next_attempt_at, idempotency_key,
       escalation_reason, estimated_cost_micros)
    VALUES
      (v_event_id, p_user_id, v_role, v_channel, COALESCE(p_priority, v_policy.priority),
       now() + make_interval(mins => v_delay), p_idempotency_key || ':' || v_channel::text,
       'unread_after_' || v_delay || '_minutes', CASE WHEN v_channel = 'whatsapp' THEN COALESCE(v_cost,0) ELSE 0 END)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
  p_limit integer,
  p_worker uuid,
  p_event_id uuid DEFAULT NULL
)
RETURNS SETOF notification_jobs
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM notification_jobs j
    JOIN notification_events e ON e.id = j.event_id
    LEFT JOIN user_notifications n ON n.id = e.in_app_notification_id
    WHERE (
      (j.state IN ('queued','failed') AND j.next_attempt_at <= now())
      OR (j.state = 'claimed' AND j.claimed_at < now() - interval '10 minutes')
    )
    AND e.acted_at IS NULL
    AND (p_event_id IS NULL OR j.event_id = p_event_id)
    AND (j.channel NOT IN ('email','whatsapp') OR n.read_at IS NULL)
    ORDER BY j.priority DESC, j.next_attempt_at, j.created_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE notification_jobs j
  SET state = 'claimed', claimed_at = now(), claim_token = p_worker,
      attempt_count = j.attempt_count + 1, updated_at = now()
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION public.try_acquire_notification_drain_lease(
  p_lease_name text,
  p_interval_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  INSERT INTO notification_drain_leases (lease_name, available_at, updated_at)
  VALUES (
    p_lease_name,
    now() + make_interval(secs => LEAST(GREATEST(p_interval_seconds, 5), 3600)),
    now()
  )
  ON CONFLICT (lease_name) DO UPDATE SET
    available_at = EXCLUDED.available_at,
    updated_at = now()
  WHERE notification_drain_leases.available_at <= now()
  RETURNING true INTO v_acquired;
  RETURN COALESCE(v_acquired, false);
END $$;

CREATE OR REPLACE FUNCTION public.can_send_whatsapp(p_job_id uuid)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job notification_jobs%ROWTYPE;
  v_policy notification_channel_policies%ROWTYPE;
  v_budget notification_budget_settings%ROWTYPE;
  v_daily integer;
  v_weekly integer;
  v_monthly integer;
BEGIN
  SELECT * INTO v_job FROM notification_jobs WHERE id = p_job_id;
  SELECT p.* INTO v_policy FROM notification_channel_policies p
    JOIN notification_events e ON e.event_type = p.event_type WHERE e.id = v_job.event_id;
  SELECT * INTO v_budget FROM notification_budget_settings WHERE singleton;
  SELECT count(*) INTO v_daily FROM notification_jobs
    WHERE user_id = v_job.user_id AND channel = 'whatsapp' AND sent_at >= date_trunc('day', now());
  SELECT count(*) INTO v_weekly FROM notification_jobs
    WHERE user_id = v_job.user_id AND channel = 'whatsapp' AND sent_at >= date_trunc('week', now());
  SELECT count(*) INTO v_monthly FROM notification_jobs
    WHERE channel = 'whatsapp' AND sent_at >= date_trunc('month', now());
  IF NOT COALESCE(v_budget.whatsapp_enabled, false) THEN RETURN QUERY SELECT false, 'global_circuit_breaker'; RETURN; END IF;
  IF v_monthly >= v_budget.whatsapp_monthly_cap THEN RETURN QUERY SELECT false, 'global_monthly_budget_cap'; RETURN; END IF;
  IF v_daily >= v_policy.whatsapp_daily_cap THEN RETURN QUERY SELECT false, 'user_daily_cap'; RETURN; END IF;
  IF v_weekly >= v_policy.whatsapp_weekly_cap THEN RETURN QUERY SELECT false, 'user_weekly_cap'; RETURN; END IF;
  RETURN QUERY SELECT true, COALESCE(v_job.escalation_reason, 'policy_escalation');
END $$;

REVOKE ALL ON FUNCTION public.enqueue_notification_event(uuid, notification_type, text, text, text, jsonb, text, notification_priority) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_notification_drain_lease(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_send_whatsapp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_event(uuid, notification_type, text, text, text, jsonb, text, notification_priority) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_notification_drain_lease(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_send_whatsapp(uuid) TO service_role;
