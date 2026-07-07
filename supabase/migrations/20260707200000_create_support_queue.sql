-- Support queue: structured coaching requests

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_request_category') THEN
    CREATE TYPE support_request_category AS ENUM (
      'question',
      'diet_update',
      'workout_update',
      'pain_injury',
      'general'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_request_status') THEN
    CREATE TYPE support_request_status AS ENUM ('open', 'claimed', 'closed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_request_priority') THEN
    CREATE TYPE support_request_priority AS ENUM ('low', 'normal', 'high', 'urgent');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_sender_type') THEN
    CREATE TYPE support_sender_type AS ENUM ('client', 'coach');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.current_coach_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM coaches WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_coach_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_coach_id() TO authenticated;

CREATE TABLE IF NOT EXISTS support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category support_request_category NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  status support_request_status NOT NULL DEFAULT 'open',
  claimed_by uuid REFERENCES coaches(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  closed_at timestamptz,
  priority support_request_priority NOT NULL DEFAULT 'normal',
  client_age text,
  client_gender text,
  client_goal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_requests_client_id_idx ON support_requests(client_id);
CREATE INDEX IF NOT EXISTS support_requests_status_idx ON support_requests(status);
CREATE INDEX IF NOT EXISTS support_requests_claimed_by_idx ON support_requests(claimed_by);
CREATE INDEX IF NOT EXISTS support_requests_created_at_idx ON support_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  sender_type support_sender_type NOT NULL,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_request_id_idx ON support_messages(request_id);
CREATE INDEX IF NOT EXISTS support_messages_created_at_idx ON support_messages(created_at);

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- support_requests: clients
CREATE POLICY "Clients can read own support requests"
  ON support_requests FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can create own support requests"
  ON support_requests FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND status = 'open'
    AND claimed_by IS NULL
  );

-- support_requests: coaches
CREATE POLICY "Coaches can read open support requests"
  ON support_requests FOR SELECT
  USING (
    status = 'open'
    AND public.current_coach_id() IS NOT NULL
  );

CREATE POLICY "Coaches can read claimed support requests"
  ON support_requests FOR SELECT
  USING (claimed_by = public.current_coach_id());

CREATE POLICY "Coaches can claim open support requests"
  ON support_requests FOR UPDATE
  USING (
    status = 'open'
    AND public.current_coach_id() IS NOT NULL
  )
  WITH CHECK (
    status = 'claimed'
    AND claimed_by = public.current_coach_id()
    AND claimed_at IS NOT NULL
  );

CREATE POLICY "Coaches can close claimed support requests"
  ON support_requests FOR UPDATE
  USING (
    status = 'claimed'
    AND claimed_by = public.current_coach_id()
  )
  WITH CHECK (
    status = 'closed'
    AND claimed_by = public.current_coach_id()
    AND closed_at IS NOT NULL
  );

-- support_requests: admins
CREATE POLICY "Admins can read all support requests"
  ON support_requests FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Admins can update all support requests"
  ON support_requests FOR UPDATE
  USING (public.is_platform_admin());

-- support_messages: clients
CREATE POLICY "Clients can read messages on own requests"
  ON support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_requests
      WHERE support_requests.id = support_messages.request_id
        AND support_requests.client_id = auth.uid()
    )
  );

CREATE POLICY "Clients can reply on own open requests"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_type = 'client'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM support_requests
      WHERE support_requests.id = support_messages.request_id
        AND support_requests.client_id = auth.uid()
        AND support_requests.status <> 'closed'
    )
  );

-- support_messages: coaches
CREATE POLICY "Coaches can read messages on visible requests"
  ON support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_requests
      WHERE support_requests.id = support_messages.request_id
        AND (
          support_requests.status = 'open'
          OR support_requests.claimed_by = public.current_coach_id()
        )
    )
    AND public.current_coach_id() IS NOT NULL
  );

CREATE POLICY "Coaches can reply on claimed requests"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_type = 'coach'
    AND sender_id = public.current_coach_id()
    AND EXISTS (
      SELECT 1 FROM support_requests
      WHERE support_requests.id = support_messages.request_id
        AND support_requests.claimed_by = public.current_coach_id()
        AND support_requests.status = 'claimed'
    )
  );

-- support_messages: admins
CREATE POLICY "Admins can read all support messages"
  ON support_messages FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Admins can insert support messages"
  ON support_messages FOR INSERT
  WITH CHECK (public.is_platform_admin());

-- Coaches can read full profile after claiming a support request
CREATE POLICY "Coaches can read claimed support client profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_requests
      WHERE support_requests.client_id = profiles.id
        AND support_requests.claimed_by = public.current_coach_id()
    )
  );
