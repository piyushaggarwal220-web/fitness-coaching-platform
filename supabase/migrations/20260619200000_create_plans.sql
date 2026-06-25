-- Coaching plans table
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Coaching Plan',
  phase text,
  workout_plan text,
  nutrition_plan text,
  cardio_plan text,
  supplement_plan text,
  coach_notes text,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plans_client_id_idx ON plans(client_id);
CREATE INDEX IF NOT EXISTS plans_coach_id_idx ON plans(coach_id);
CREATE INDEX IF NOT EXISTS plans_active_idx ON plans(active);
CREATE INDEX IF NOT EXISTS plans_client_version_idx ON plans(client_id, version DESC);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Clients can read their own active plan
CREATE POLICY "Clients can read own active plans"
  ON plans FOR SELECT
  USING (auth.uid() = client_id AND active = true);

-- Coaches can manage plans for assigned clients
CREATE POLICY "Coaches can read assigned client plans"
  ON plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = plans.coach_id
        AND coaches.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert assigned client plans"
  ON plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = plans.coach_id
        AND coaches.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = plans.client_id
        AND profiles.coach_id = plans.coach_id
    )
  );

CREATE POLICY "Coaches can update assigned client plans"
  ON plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = plans.coach_id
        AND coaches.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete assigned client plans"
  ON plans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = plans.coach_id
        AND coaches.user_id = auth.uid()
    )
  );
