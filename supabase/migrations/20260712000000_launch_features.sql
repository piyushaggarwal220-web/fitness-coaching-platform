-- Launch sprint: redemption codes, coach chat, notifications, issue reports, coach ratings

-- ─── Profiles: subscription expiry + redemption access source ───
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_access_source_check'
  ) THEN
  END IF;
END $$;

-- ─── Redemption codes ───
CREATE TABLE IF NOT EXISTS redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  plan_slug text NOT NULL,
  duration_months int NOT NULL CHECK (duration_months > 0),
  max_redemptions int NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  remaining_uses int NOT NULL CHECK (remaining_uses >= 0),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_reusable boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redemption_codes_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS redemption_codes_code_idx ON redemption_codes(upper(code));
CREATE INDEX IF NOT EXISTS redemption_codes_active_idx ON redemption_codes(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS redemption_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES redemption_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, user_id)
);

CREATE INDEX IF NOT EXISTS redemption_usages_user_id_idx ON redemption_usages(user_id);

ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage redemption codes"
  ON redemption_codes FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Admins read redemption usages"
  ON redemption_usages FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Users read own redemption usages"
  ON redemption_usages FOR SELECT
  USING (auth.uid() = user_id);

-- ─── Coach conversations (direct coach-client messaging) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_status') THEN
    CREATE TYPE conversation_status AS ENUM ('connecting', 'active', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM ('text', 'image', 'voice', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_sender') THEN
    CREATE TYPE message_sender AS ENUM ('client', 'coach', 'system');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  status conversation_status NOT NULL DEFAULT 'connecting',
  unread_by_client int NOT NULL DEFAULT 0,
  unread_by_coach int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  client_typing_at timestamptz,
  coach_typing_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_conversations_client_active_idx
  ON coach_conversations(client_id)
  WHERE status <> 'closed';

CREATE INDEX IF NOT EXISTS coach_conversations_coach_id_idx ON coach_conversations(coach_id);
CREATE INDEX IF NOT EXISTS coach_conversations_last_message_idx ON coach_conversations(last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  sender_type message_sender NOT NULL,
  sender_id uuid,
  message_type message_type NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  media_duration_seconds int,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx ON conversation_messages(conversation_id, created_at);

ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Clients read own conversations
CREATE POLICY "Clients read own conversations"
  ON coach_conversations FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients create own conversations"
  ON coach_conversations FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients update own conversations"
  ON coach_conversations FOR UPDATE
  USING (auth.uid() = client_id);

-- Coaches read assigned conversations
CREATE POLICY "Coaches read assigned conversations"
  ON coach_conversations FOR SELECT
  USING (coach_id = public.current_coach_id());

CREATE POLICY "Coaches update assigned conversations"
  ON coach_conversations FOR UPDATE
  USING (coach_id = public.current_coach_id());

-- Admins read all conversations
CREATE POLICY "Admins read all conversations"
  ON coach_conversations FOR SELECT
  USING (public.is_platform_admin());

-- Message policies: clients
CREATE POLICY "Clients read own conversation messages"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_conversations
      WHERE coach_conversations.id = conversation_messages.conversation_id
        AND coach_conversations.client_id = auth.uid()
    )
  );

CREATE POLICY "Clients send messages in own conversations"
  ON conversation_messages FOR INSERT
  WITH CHECK (
    sender_type = 'client'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM coach_conversations
      WHERE coach_conversations.id = conversation_messages.conversation_id
        AND coach_conversations.client_id = auth.uid()
        AND coach_conversations.status <> 'closed'
    )
  );

-- Message policies: coaches
CREATE POLICY "Coaches read assigned conversation messages"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_conversations
      WHERE coach_conversations.id = conversation_messages.conversation_id
        AND coach_conversations.coach_id = public.current_coach_id()
    )
    AND public.current_coach_id() IS NOT NULL
  );

CREATE POLICY "Coaches send messages in assigned conversations"
  ON conversation_messages FOR INSERT
  WITH CHECK (
    sender_type = 'coach'
    AND sender_id = public.current_coach_id()
    AND EXISTS (
      SELECT 1 FROM coach_conversations
      WHERE coach_conversations.id = conversation_messages.conversation_id
        AND coach_conversations.coach_id = public.current_coach_id()
        AND coach_conversations.status <> 'closed'
    )
  );

CREATE POLICY "Admins read all conversation messages"
  ON conversation_messages FOR SELECT
  USING (public.is_platform_admin());

-- ─── In-app user notifications ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'plan_delivered',
      'coach_replied',
      'weekly_checkin_reminder',
      'support_reply',
      'coach_assigned',
      'welcome',
      'progress_milestone',
      'unread_chat',
      'issue_update',
      'plan_available',
      'missed_checkin'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  action_url text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx ON user_notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON user_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users mark own notifications read"
  ON user_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all notifications"
  ON user_notifications FOR SELECT
  USING (public.is_platform_admin());

-- ─── Issue reports ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_status') THEN
    CREATE TYPE issue_status AS ENUM ('open', 'investigating', 'resolved', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_category') THEN
    CREATE TYPE issue_category AS ENUM ('bug', 'feature', 'account', 'billing', 'other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category issue_category,
  description text NOT NULL,
  screenshot_url text,
  system_info jsonb,
  status issue_status NOT NULL DEFAULT 'open',
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_status_idx ON issue_reports(status);
CREATE INDEX IF NOT EXISTS issue_reports_client_id_idx ON issue_reports(client_id);

ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients create own issue reports"
  ON issue_reports FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients read own issue reports"
  ON issue_reports FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Admins manage all issue reports"
  ON issue_reports FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── Coach reply ratings ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coach_rating_value') THEN
    CREATE TYPE coach_rating_value AS ENUM ('very_helpful', 'helpful', 'needs_improvement');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS coach_reply_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  rating coach_rating_value NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, client_id)
);

CREATE INDEX IF NOT EXISTS coach_reply_ratings_coach_id_idx ON coach_reply_ratings(coach_id);

ALTER TABLE coach_reply_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients create own ratings"
  ON coach_reply_ratings FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients read own ratings"
  ON coach_reply_ratings FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Coaches read ratings on their messages"
  ON coach_reply_ratings FOR SELECT
  USING (coach_id = public.current_coach_id());

CREATE POLICY "Admins read all ratings"
  ON coach_reply_ratings FOR SELECT
  USING (public.is_platform_admin());

-- ─── Storage buckets for chat media ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-voice', 'chat-voice', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-screenshots', 'issue-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Chat images storage policies
CREATE POLICY "Users upload chat images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read chat images in their conversations"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Chat voice storage policies
CREATE POLICY "Coaches upload voice notes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-voice'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read voice notes in conversations"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-voice'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM coach_conversations cc
        JOIN coaches c ON c.id = cc.coach_id
        WHERE c.user_id = auth.uid()
          AND cc.id::text = (storage.foldername(name))[2]
      )
      OR EXISTS (
        SELECT 1 FROM coach_conversations cc
        WHERE cc.client_id = auth.uid()
          AND cc.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- Issue screenshots
CREATE POLICY "Users upload issue screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'issue-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own issue screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'issue-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins read issue screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'issue-screenshots'
    AND public.is_platform_admin()
  );
