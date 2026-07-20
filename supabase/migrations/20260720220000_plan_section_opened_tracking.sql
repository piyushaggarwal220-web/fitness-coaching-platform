-- Track when a client first opens diet / workout sections of their active plan
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS diet_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS workout_opened_at timestamptz;

COMMENT ON COLUMN plans.diet_opened_at IS 'When the client first opened the diet section of this plan';
COMMENT ON COLUMN plans.workout_opened_at IS 'When the client first opened the workout section of this plan';

CREATE OR REPLACE FUNCTION public.mark_plan_section_opened(p_plan_id uuid, p_section text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_section NOT IN ('diet', 'workout') THEN
    RAISE EXCEPTION 'Invalid section';
  END IF;

  IF p_section = 'diet' THEN
    UPDATE plans
    SET diet_opened_at = COALESCE(diet_opened_at, now())
    WHERE id = p_plan_id
      AND client_id = auth.uid()
      AND active = true;
  ELSE
    UPDATE plans
    SET workout_opened_at = COALESCE(workout_opened_at, now())
    WHERE id = p_plan_id
      AND client_id = auth.uid()
      AND active = true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_plan_section_opened(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_plan_section_opened(uuid, text) TO authenticated;
