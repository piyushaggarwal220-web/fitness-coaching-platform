-- Jarvis Phase 10: Autonomous Business Operator
-- Observation snapshots, attention queue (fingerprint dedupe), morning briefs.
-- Does not replace jarvis_incidents / jarvis_tasks / approvals / digests.

CREATE TABLE IF NOT EXISTS public.jarvis_observation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at timestamptz NOT NULL DEFAULT now(),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  cycle_id uuid,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  revenue jsonb NOT NULL DEFAULT '{}'::jsonb,
  marketing jsonb NOT NULL DEFAULT '{}'::jsonb,
  funnels jsonb NOT NULL DEFAULT '{}'::jsonb,
  instagram jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  video jsonb NOT NULL DEFAULT '{}'::jsonb,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  systems jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_status text NOT NULL DEFAULT 'verified',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_observation_snapshots_observed_idx
  ON public.jarvis_observation_snapshots(observed_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_attention_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  severity text NOT NULL
    CHECK (severity IN ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  system text NOT NULL,
  title text NOT NULL,
  observation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action text,
  requires_approval boolean NOT NULL DEFAULT false,
  deadline_at timestamptz,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'awaiting_approval', 'resolved', 'snoozed', 'dismissed')),
  task_id uuid REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL,
  approval_id uuid REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  diagnosis jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jarvis_attention_fingerprint_uidx
  ON public.jarvis_attention_items(fingerprint)
  WHERE status IN ('open', 'investigating', 'awaiting_approval', 'snoozed');
CREATE INDEX IF NOT EXISTS jarvis_attention_status_sev_idx
  ON public.jarvis_attention_items(status, severity, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_morning_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  text text NOT NULL,
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  meaningful boolean NOT NULL DEFAULT true,
  snapshot_id uuid REFERENCES public.jarvis_observation_snapshots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jarvis_morning_briefs_date_uidx
  ON public.jarvis_morning_briefs(brief_date);

ALTER TABLE public.jarvis_incidents
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS jarvis_incidents_fingerprint_idx
  ON public.jarvis_incidents(fingerprint)
  WHERE fingerprint IS NOT NULL;

ALTER TABLE public.jarvis_observation_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_observation_snapshots" ON public.jarvis_observation_snapshots;
CREATE POLICY "Admins read jarvis_observation_snapshots"
  ON public.jarvis_observation_snapshots FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_observation_snapshots" ON public.jarvis_observation_snapshots;
CREATE POLICY "Admins write jarvis_observation_snapshots"
  ON public.jarvis_observation_snapshots FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_attention_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_attention_items" ON public.jarvis_attention_items;
CREATE POLICY "Admins read jarvis_attention_items"
  ON public.jarvis_attention_items FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_attention_items" ON public.jarvis_attention_items;
CREATE POLICY "Admins write jarvis_attention_items"
  ON public.jarvis_attention_items FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE public.jarvis_morning_briefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read jarvis_morning_briefs" ON public.jarvis_morning_briefs;
CREATE POLICY "Admins read jarvis_morning_briefs"
  ON public.jarvis_morning_briefs FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write jarvis_morning_briefs" ON public.jarvis_morning_briefs;
CREATE POLICY "Admins write jarvis_morning_briefs"
  ON public.jarvis_morning_briefs FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
