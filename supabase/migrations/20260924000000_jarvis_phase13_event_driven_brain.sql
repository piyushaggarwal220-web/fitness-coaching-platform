-- Jarvis Phase 13: Event-Driven Business Brain
-- Extends existing jarvis_events; adds cooldowns. Non-destructive.

ALTER TABLE public.jarvis_events
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS system text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS funnel_id text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coalesced_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES public.jarvis_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS significance text,
  ADD COLUMN IF NOT EXISTS significance_reason text,
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 13;

-- Expand status vocabulary (keep legacy pending/processing/processed/skipped/failed)
ALTER TABLE public.jarvis_events DROP CONSTRAINT IF EXISTS jarvis_events_status_check;
ALTER TABLE public.jarvis_events
  ADD CONSTRAINT jarvis_events_status_check
  CHECK (status IN (
    'pending', 'processing', 'processed', 'skipped', 'failed',
    'RECEIVED', 'VALIDATED', 'DUPLICATE', 'COALESCED', 'QUEUED',
    'PROCESSING', 'INVESTIGATING', 'ACTION_PENDING', 'COMPLETED',
    'IGNORED', 'DEFERRED', 'FAILED'
  ));

CREATE INDEX IF NOT EXISTS jarvis_events_fingerprint_idx
  ON public.jarvis_events(fingerprint, created_at DESC);

CREATE INDEX IF NOT EXISTS jarvis_events_priority_queue_idx
  ON public.jarvis_events(status, priority, created_at);

CREATE INDEX IF NOT EXISTS jarvis_events_funnel_idx
  ON public.jarvis_events(funnel_id, created_at DESC)
  WHERE funnel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.jarvis_event_cooldowns (
  cooldown_key text PRIMARY KEY,
  event_type text NOT NULL,
  fingerprint text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_event_cooldowns_expires_idx
  ON public.jarvis_event_cooldowns(expires_at);

ALTER TABLE public.jarvis_event_cooldowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read jarvis_event_cooldowns" ON public.jarvis_event_cooldowns;
CREATE POLICY "Admins read jarvis_event_cooldowns"
  ON public.jarvis_event_cooldowns FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins write jarvis_event_cooldowns" ON public.jarvis_event_cooldowns;
CREATE POLICY "Admins write jarvis_event_cooldowns"
  ON public.jarvis_event_cooldowns FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
