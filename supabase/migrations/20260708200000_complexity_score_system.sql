-- Complexity Score platform metric: profile fields + immutable history

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complexity_tier') THEN
    CREATE TYPE complexity_tier AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complexity_trigger_source') THEN
    CREATE TYPE complexity_trigger_source AS ENUM (
      'onboarding_complete',
      'weekly_checkin',
      'profile_edit_client',
      'profile_edit_coach',
      'profile_edit_admin',
      'manual'
    );
  END IF;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS complexity_score integer,
  ADD COLUMN IF NOT EXISTS complexity_raw_score integer,
  ADD COLUMN IF NOT EXISTS complexity_tier complexity_tier,
  ADD COLUMN IF NOT EXISTS complexity_last_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS complexity_previous_score integer,
  ADD COLUMN IF NOT EXISTS complexity_previous_tier complexity_tier,
  ADD COLUMN IF NOT EXISTS complexity_score_change integer;

CREATE INDEX IF NOT EXISTS profiles_complexity_tier_idx ON profiles (complexity_tier)
  WHERE role = 'client';
CREATE INDEX IF NOT EXISTS profiles_complexity_score_idx ON profiles (complexity_score DESC NULLS LAST)
  WHERE role = 'client';
CREATE INDEX IF NOT EXISTS profiles_complexity_last_calculated_at_idx ON profiles (complexity_last_calculated_at DESC NULLS LAST)
  WHERE role = 'client';

CREATE TABLE IF NOT EXISTS complexity_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raw_score integer NOT NULL,
  display_score integer NOT NULL CHECK (display_score >= 0 AND display_score <= 100),
  tier complexity_tier NOT NULL,
  previous_raw_score integer,
  previous_display_score integer,
  previous_tier complexity_tier,
  score_change integer,
  trigger_source complexity_trigger_source NOT NULL,
  reasoning jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkin_id uuid REFERENCES checkins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complexity_score_history_client_id_idx
  ON complexity_score_history (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complexity_score_history_created_at_idx
  ON complexity_score_history (created_at DESC);
CREATE INDEX IF NOT EXISTS complexity_score_history_tier_idx
  ON complexity_score_history (tier);

ALTER TABLE complexity_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own complexity history"
  ON complexity_score_history FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Coaches can read assigned client complexity history"
  ON complexity_score_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN coaches c ON c.id = p.coach_id
      WHERE p.id = complexity_score_history.client_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all complexity history"
  ON complexity_score_history FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Service role manages complexity history"
  ON complexity_score_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
