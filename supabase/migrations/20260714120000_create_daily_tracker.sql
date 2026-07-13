-- Daily Tracker: one row per client per day with frozen plan snapshot + completion

CREATE TABLE IF NOT EXISTS daily_tracker_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  plan_version integer NOT NULL,
  coaching_day integer,
  coaching_week integer,
  snapshot jsonb NOT NULL,
  completion jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb,
  overall_percent smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, log_date)
);

CREATE INDEX IF NOT EXISTS daily_tracker_days_client_date_idx
  ON daily_tracker_days (client_id, log_date DESC);

CREATE INDEX IF NOT EXISTS daily_tracker_days_plan_version_idx
  ON daily_tracker_days (client_id, plan_version);

ALTER TABLE daily_tracker_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own tracker days"
  ON daily_tracker_days FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can insert own tracker days"
  ON daily_tracker_days FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update own tracker days"
  ON daily_tracker_days FOR UPDATE
  USING (auth.uid() = client_id);

CREATE POLICY "Coaches can read assigned client tracker days"
  ON daily_tracker_days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN coaches ON coaches.id = profiles.coach_id
      WHERE profiles.id = daily_tracker_days.client_id
        AND coaches.user_id = auth.uid()
    )
  );
