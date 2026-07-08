-- supabase/migrations/20260708100000_add_home_workout_prompt_categories.sql
-- Home workout prompt categories (import + publish via Prompt Library; no app deploy required)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'prompt_library_category' AND e.enumlabel = 'initial_workout_home'
  ) THEN
    ALTER TYPE prompt_library_category ADD VALUE 'initial_workout_home';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'prompt_library_category' AND e.enumlabel = 'weekly_workout_update_home'
  ) THEN
    ALTER TYPE prompt_library_category ADD VALUE 'weekly_workout_update_home';
  END IF;
END $$;

-- supabase/migrations/20260708110000_seed_ai_knowledge.sql
-- Seed core coaching knowledge for AI prompt injection (idempotent)

INSERT INTO ai_knowledge (title, category, content, version, active)
SELECT v.title, v.category, v.content, 1, true
FROM (VALUES
  (
    'Fat loss fundamentals',
    'fat_loss',
    'Target a sustainable 300–500 kcal daily deficit. Prioritise protein 1.8–2.2 g/kg bodyweight. Keep fibre high for satiety. Weigh 3–4 mornings per week; trend matters more than single readings. Never drop below ~1600 kcal without medical oversight.'
  ),
  (
    'Muscle gain fundamentals',
    'muscle_gain',
    'Target a 200–300 kcal surplus with protein 1.6–2.2 g/kg. Progress load or reps when all prescribed sets are completed with good form. Sleep 7–9 hours for recovery. Gain 0.25–0.5 kg per week as a practical upper bound for lean gains.'
  ),
  (
    'Recomposition guidance',
    'recomposition',
    'At maintenance or slight deficit with high protein (2.0+ g/kg). Combine resistance training 3–5 days/week with moderate cardio. Progress strength consistently; scale weight may change slowly while measurements improve.'
  ),
  (
    'Strength programming',
    'strength',
    'Prioritise compound lifts, 3–6 rep ranges for main lifts, longer rest (2–4 min). Deload every 4–8 weeks or when performance stalls with poor recovery. Technique before load.'
  ),
  (
    'Nutrition principles',
    'nutrition',
    'Build meals around protein, vegetables, and minimally processed carbs. Distribute protein across 3–5 meals. Hydration ~2–3 L/day unless medically restricted. Align meal timing with client schedule for adherence.'
  ),
  (
    'Cardio guidelines',
    'cardio',
    'LISS 20–40 min post-workout or on rest days for fat loss. Limit HIIT to 1–2 sessions/week if recovery is poor. Step targets support NEAT; do not replace resistance training with cardio volume.'
  ),
  (
    'Supplement guidance',
    'supplements',
    'Evidence-supported basics: creatine monohydrate 3–5 g/day, vitamin D if deficient, whey if protein gap exists. Supplements do not replace food. Avoid recommending medical-grade doses without clearance.'
  ),
  (
    'Recovery principles',
    'recovery',
    'Sleep is the primary recovery tool. Manage training volume when sleep <6 h or stress is high. Active recovery walks and mobility on rest days. Two rest days per week minimum for most beginners.'
  ),
  (
    'Weekly check-in interpretation',
    'checkins',
    'Use weight trend, waist, hunger, energy, training performance, and adherence together — never one metric alone. Hunger 8+/10 with fat loss goal → increase protein/fibre or small calorie adjustment. Adherence <7 → simplify plan.'
  ),
  (
    'Injury modifications',
    'injuries',
    'Never train through sharp pain. Substitute aggravating movements (e.g. knee pain: limit deep flexion, use hip hinge variations). Recommend medical clearance for acute or worsening symptoms.'
  ),
  (
    'Female-specific considerations',
    'female',
    'Account for menstrual cycle energy fluctuations; maintain protein and iron-rich foods. Avoid extreme deficits; bone health and hormonal balance matter for long-term adherence.'
  ),
  (
    'Beginner training',
    'beginner',
    'Full-body or upper/lower 3 days/week. Teach form before load. 8–15 reps, 2–3 sets per exercise. Progress one variable at a time. Keep sessions under 60 minutes.'
  ),
  (
    'Intermediate training',
    'intermediate',
    'Use structured splits (PPL, upper/lower). Periodise volume and intensity. Track loads. Deload when performance drops 2+ weeks despite adequate sleep.'
  ),
  (
    'Advanced training',
    'advanced',
    'Individualise volume landmarks, weak-point work, and mesocycles. Autoregulate load via RPE/RIR. Recovery capacity limits frequency — quality over novelty.'
  )
) AS v(title, category, content)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_knowledge k WHERE k.category = v.category AND k.active = true
);

-- supabase/migrations/20260708200000_complexity_score_system.sql
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
