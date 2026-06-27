-- Workouts table + coach access policies for MVP workflow

CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration integer,
  calories integer DEFAULT 0,
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workouts_user_id_idx ON workouts(user_id);
CREATE INDEX IF NOT EXISTS workouts_created_at_idx ON workouts(created_at DESC);

ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workouts"
  ON workouts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Coaches can read assigned client workouts"
  ON workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN coaches ON coaches.id = profiles.coach_id
      WHERE profiles.id = workouts.user_id
        AND coaches.user_id = auth.uid()
    )
  );

-- Coach read access to assigned client profiles (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Coaches can read assigned client profiles'
  ) THEN
    CREATE POLICY "Coaches can read assigned client profiles"
      ON profiles FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM coaches
          WHERE coaches.id = profiles.coach_id
            AND coaches.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Coaches can update assigned client status flags'
  ) THEN
    CREATE POLICY "Coaches can update assigned client status flags"
      ON profiles FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM coaches
          WHERE coaches.id = profiles.coach_id
            AND coaches.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Coaches can read own coach row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coaches' AND policyname = 'Coaches can read own coach row'
  ) THEN
    CREATE POLICY "Coaches can read own coach row"
      ON coaches FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Users can read and update own profile (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile"
      ON profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;
