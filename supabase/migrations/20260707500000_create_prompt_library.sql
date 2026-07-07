-- Prompt Library: canonical prompts with immutable version history

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prompt_library_category') THEN
    CREATE TYPE prompt_library_category AS ENUM (
      'system_prompt',
      'initial_diet',
      'initial_workout',
      'weekly_diet_update',
      'weekly_workout_update',
      'mid_week_analysis',
      'coach_message',
      'future_prompts'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prompt_version_status') THEN
    CREATE TYPE prompt_version_status AS ENUM ('draft', 'published', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS prompt_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category prompt_library_category NOT NULL,
  description text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS prompt_library_category_idx ON prompt_library(category);
CREATE INDEX IF NOT EXISTS prompt_library_updated_at_idx ON prompt_library(updated_at DESC);
CREATE INDEX IF NOT EXISTS prompt_library_archived_at_idx ON prompt_library(archived_at);

CREATE TABLE IF NOT EXISTS prompt_library_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES prompt_library(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status prompt_version_status NOT NULL DEFAULT 'draft',
  prompt_body text NOT NULL DEFAULT '',
  description text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (prompt_id, version)
);

CREATE INDEX IF NOT EXISTS prompt_library_versions_prompt_id_idx ON prompt_library_versions(prompt_id);
CREATE INDEX IF NOT EXISTS prompt_library_versions_status_idx ON prompt_library_versions(status);
CREATE INDEX IF NOT EXISTS prompt_library_versions_published_at_idx ON prompt_library_versions(published_at DESC);

-- At most one draft per prompt
CREATE UNIQUE INDEX IF NOT EXISTS prompt_library_versions_one_draft_per_prompt_idx
  ON prompt_library_versions(prompt_id)
  WHERE status = 'draft';

ALTER TABLE prompt_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_library_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read prompt library"
  ON prompt_library FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage prompt library"
  ON prompt_library FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Admins can read prompt library versions"
  ON prompt_library_versions FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage prompt library versions"
  ON prompt_library_versions FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
