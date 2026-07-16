-- Saved corrections: plan exercise name -> YMove video id
CREATE TABLE IF NOT EXISTS public.exercise_demo_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_key text NOT NULL UNIQUE,
  display_name text,
  ymove_exercise_id text NOT NULL,
  ymove_slug text,
  ymove_title text,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_demo_overrides_ymove_idx
  ON public.exercise_demo_overrides (ymove_exercise_id);

ALTER TABLE public.exercise_demo_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read exercise demo overrides" ON public.exercise_demo_overrides;
CREATE POLICY "Authenticated read exercise demo overrides"
  ON public.exercise_demo_overrides FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated upsert exercise demo overrides" ON public.exercise_demo_overrides;
CREATE POLICY "Authenticated upsert exercise demo overrides"
  ON public.exercise_demo_overrides FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = updated_by);

DROP POLICY IF EXISTS "Authenticated update exercise demo overrides" ON public.exercise_demo_overrides;
CREATE POLICY "Authenticated update exercise demo overrides"
  ON public.exercise_demo_overrides FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = updated_by);

COMMENT ON TABLE public.exercise_demo_overrides IS
  'Maps normalized plan exercise names to the correct YMove exercise video after user/coach correction';
