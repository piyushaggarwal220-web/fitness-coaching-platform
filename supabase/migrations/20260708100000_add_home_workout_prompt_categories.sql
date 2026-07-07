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
