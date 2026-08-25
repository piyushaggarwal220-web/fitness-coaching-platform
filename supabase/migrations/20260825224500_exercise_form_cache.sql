-- Cached MuscleWiki form lookups (name -> demo). Service role only.
CREATE TABLE IF NOT EXISTS public.exercise_form_cache (
  name_key text PRIMARY KEY,
  musclewiki_id integer,
  display_name text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  muscles jsonb NOT NULL DEFAULT '[]'::jsonb,
  videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  found boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_form_cache_fetched_idx
  ON public.exercise_form_cache (fetched_at DESC);

ALTER TABLE public.exercise_form_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.exercise_form_cache IS
  'Maps normalized tracker exercise names to MuscleWiki form demos. Written by the server only.';
