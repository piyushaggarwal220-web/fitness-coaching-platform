-- Recurring check-in system: mid-week (day 3) and weekly (day 7) check-ins

-- Profile check-in flags (used by app; may already exist in production)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS checkin_awaiting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_overdue boolean NOT NULL DEFAULT false;

-- Check-in type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkin_type') THEN
    CREATE TYPE checkin_type AS ENUM ('mid_week', 'weekly');
  END IF;
END $$;

-- Extend checkins table
ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS checkin_type checkin_type NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS coaching_week integer,
  ADD COLUMN IF NOT EXISTS coaching_day integer,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS diet_adherence integer CHECK (diet_adherence IS NULL OR (diet_adherence >= 1 AND diet_adherence <= 10)),
  ADD COLUMN IF NOT EXISTS workout_adherence integer CHECK (workout_adherence IS NULL OR (workout_adherence >= 1 AND workout_adherence <= 10)),
  ADD COLUMN IF NOT EXISTS sleep_quality integer CHECK (sleep_quality IS NULL OR (sleep_quality >= 1 AND sleep_quality <= 10)),
  ADD COLUMN IF NOT EXISTS stress_level integer CHECK (stress_level IS NULL OR (stress_level >= 1 AND stress_level <= 10)),
  ADD COLUMN IF NOT EXISTS motivation_level integer CHECK (motivation_level IS NULL OR (motivation_level >= 1 AND motivation_level <= 10)),
  ADD COLUMN IF NOT EXISTS digestion text,
  ADD COLUMN IF NOT EXISTS pain_injuries text,
  ADD COLUMN IF NOT EXISTS questions_for_coach text,
  ADD COLUMN IF NOT EXISTS cardio_completed text,
  ADD COLUMN IF NOT EXISTS extra_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_version integer;

-- Backfill legacy rows
UPDATE checkins
SET
  coaching_week = COALESCE(coaching_week, 1),
  coaching_day = COALESCE(coaching_day, 7),
  diet_adherence = COALESCE(diet_adherence, adherence_score),
  workout_adherence = COALESCE(workout_adherence, training_performance)
WHERE checkin_type = 'weekly' AND coaching_week IS NULL;

-- Prevent duplicate submissions per client/week/type
CREATE UNIQUE INDEX IF NOT EXISTS checkins_client_week_type_uidx
  ON checkins (client_id, coaching_week, checkin_type)
  WHERE coaching_week IS NOT NULL;

CREATE INDEX IF NOT EXISTS checkins_type_idx ON checkins (checkin_type);
CREATE INDEX IF NOT EXISTS checkins_due_date_idx ON checkins (due_date);

-- Journey entries (one per weekly check-in)
CREATE TABLE IF NOT EXISTS journey_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checkin_id uuid NOT NULL UNIQUE REFERENCES checkins(id) ON DELETE CASCADE,
  entry_date timestamptz NOT NULL,
  weight numeric,
  photo_front text,
  photo_side text,
  photo_back text,
  extra_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkin_summary text,
  plan_version integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journey_entries_client_id_idx ON journey_entries (client_id, entry_date DESC);

ALTER TABLE journey_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own journey entries"
  ON journey_entries FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can insert own journey entries"
  ON journey_entries FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coaches can read assigned client journey entries"
  ON journey_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN coaches c ON c.id = p.coach_id
      WHERE p.id = journey_entries.client_id
        AND c.user_id = auth.uid()
    )
  );

-- Notification types for check-in events
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'checkin_submitted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mid_week_checkin_reminder';
