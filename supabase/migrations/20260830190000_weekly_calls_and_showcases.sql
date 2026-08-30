-- Weekly 12-month call scheduling + transformation showcase pipeline

ALTER TABLE public.call_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'client_requested';

ALTER TABLE public.call_requests
  DROP CONSTRAINT IF EXISTS call_requests_source_check;

ALTER TABLE public.call_requests
  ADD CONSTRAINT call_requests_source_check
  CHECK (source IN ('client_requested', 'weekly_entitlement'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_call_weekday smallint NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS preferred_call_hour_ist smallint NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS marketing_photo_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_quote_consent_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_call_weekday_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_call_weekday_check
  CHECK (preferred_call_weekday >= 0 AND preferred_call_weekday <= 6);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_call_hour_ist_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_call_hour_ist_check
  CHECK (preferred_call_hour_ist >= 0 AND preferred_call_hour_ist <= 23);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transformation_showcase_status') THEN
    CREATE TYPE public.transformation_showcase_status AS ENUM (
      'candidate',
      'approved',
      'published',
      'rejected'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.transformation_showcases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  status public.transformation_showcase_status NOT NULL DEFAULT 'candidate',
  score_snapshot integer,
  grade_snapshot text,
  quote text,
  before_photo_url text,
  after_photo_url text,
  weight_start_kg numeric,
  weight_latest_kg numeric,
  weight_change_kg numeric,
  weeks_active integer,
  nominated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS transformation_showcases_one_open_per_client
  ON public.transformation_showcases(client_id)
  WHERE status IN ('candidate', 'approved', 'published');

CREATE INDEX IF NOT EXISTS transformation_showcases_status_idx
  ON public.transformation_showcases(status, created_at DESC);

ALTER TABLE public.transformation_showcases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches read own transformation showcases"
  ON public.transformation_showcases FOR SELECT TO authenticated
  USING (
    coach_id = public.current_coach_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "Admins manage transformation showcases"
  ON public.transformation_showcases FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
