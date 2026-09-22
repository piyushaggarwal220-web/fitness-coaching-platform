-- Instagram Content Intelligence: organic media catalog + historical metric snapshots.
-- Does NOT reuse marketing_performance (Meta ads). Organic Graph history only.
-- Explicit Meta zeroes are stored as metric_value=0 with metric_status='verified'.
-- Unavailable/unsupported metrics use metric_value=NULL with status accordingly.

CREATE TABLE IF NOT EXISTS public.marketing_instagram_media (
  ig_account_id text NOT NULL,
  media_id text NOT NULL,
  username text,
  caption text,
  permalink text,
  media_type text,
  media_product_type text,
  media_timestamp timestamptz,
  like_count bigint,
  like_count_status text NOT NULL DEFAULT 'unavailable'
    CHECK (like_count_status IN ('verified', 'unavailable', 'unsupported', 'failed')),
  comments_count bigint,
  comments_count_status text NOT NULL DEFAULT 'unavailable'
    CHECK (comments_count_status IN ('verified', 'unavailable', 'unsupported', 'failed')),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_run_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ig_account_id, media_id)
);

CREATE INDEX IF NOT EXISTS marketing_instagram_media_synced_idx
  ON public.marketing_instagram_media(last_synced_at DESC);
CREATE INDEX IF NOT EXISTS marketing_instagram_media_timestamp_idx
  ON public.marketing_instagram_media(media_timestamp DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.marketing_instagram_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id text NOT NULL,
  media_id text NOT NULL,
  -- NULL media_timestamp allowed for account-level metrics (followers, follows, media_count)
  media_timestamp timestamptz,
  metric_name text NOT NULL,
  metric_value numeric,
  metric_status text NOT NULL
    CHECK (metric_status IN ('verified', 'unavailable', 'unsupported', 'failed')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency grain: one row per account/media/metric per IST calendar day
  snapshot_day date NOT NULL,
  media_type text,
  media_product_type text,
  sync_run_id uuid NOT NULL,
  provider_period text,
  error_redacted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ig_account_id, media_id, metric_name, snapshot_day)
);

CREATE INDEX IF NOT EXISTS marketing_instagram_metric_snapshots_day_idx
  ON public.marketing_instagram_metric_snapshots(snapshot_day DESC);
CREATE INDEX IF NOT EXISTS marketing_instagram_metric_snapshots_media_idx
  ON public.marketing_instagram_metric_snapshots(ig_account_id, media_id);
CREATE INDEX IF NOT EXISTS marketing_instagram_metric_snapshots_name_idx
  ON public.marketing_instagram_metric_snapshots(metric_name, snapshot_day DESC);

CREATE TABLE IF NOT EXISTS public.marketing_instagram_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'partial', 'failed', 'budget_exhausted', 'rate_limited')),
  media_limit integer NOT NULL DEFAULT 12,
  media_fetched integer NOT NULL DEFAULT 0,
  insights_fetched integer NOT NULL DEFAULT 0,
  snapshots_upserted integer NOT NULL DEFAULT 0,
  api_calls integer NOT NULL DEFAULT 0,
  error_redacted text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_instagram_sync_runs_account_idx
  ON public.marketing_instagram_sync_runs(ig_account_id, started_at DESC);

ALTER TABLE public.marketing_instagram_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_instagram_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_instagram_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read marketing_instagram_media" ON public.marketing_instagram_media;
CREATE POLICY "Admins read marketing_instagram_media"
  ON public.marketing_instagram_media FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write marketing_instagram_media" ON public.marketing_instagram_media;
CREATE POLICY "Admins write marketing_instagram_media"
  ON public.marketing_instagram_media FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read marketing_instagram_metric_snapshots" ON public.marketing_instagram_metric_snapshots;
CREATE POLICY "Admins read marketing_instagram_metric_snapshots"
  ON public.marketing_instagram_metric_snapshots FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write marketing_instagram_metric_snapshots" ON public.marketing_instagram_metric_snapshots;
CREATE POLICY "Admins write marketing_instagram_metric_snapshots"
  ON public.marketing_instagram_metric_snapshots FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins read marketing_instagram_sync_runs" ON public.marketing_instagram_sync_runs;
CREATE POLICY "Admins read marketing_instagram_sync_runs"
  ON public.marketing_instagram_sync_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins write marketing_instagram_sync_runs" ON public.marketing_instagram_sync_runs;
CREATE POLICY "Admins write marketing_instagram_sync_runs"
  ON public.marketing_instagram_sync_runs FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
