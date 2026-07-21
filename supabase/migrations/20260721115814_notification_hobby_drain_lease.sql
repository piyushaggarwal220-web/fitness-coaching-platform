-- Hobby-compatible event-driven notification draining and cross-instance lease.

CREATE TABLE IF NOT EXISTS public.notification_drain_leases (
  lease_name text PRIMARY KEY,
  available_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_drain_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_drain_leases FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.claim_notification_jobs(integer, uuid);

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(
  p_limit integer,
  p_worker uuid,
  p_event_id uuid DEFAULT NULL
)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.notification_jobs j
    JOIN public.notification_events e ON e.id = j.event_id
    LEFT JOIN public.user_notifications n ON n.id = e.in_app_notification_id
    WHERE (
      (j.state IN ('queued', 'failed') AND j.next_attempt_at <= now())
      OR (j.state = 'claimed' AND j.claimed_at < now() - interval '10 minutes')
    )
    AND e.acted_at IS NULL
    AND (p_event_id IS NULL OR j.event_id = p_event_id)
    AND (j.channel NOT IN ('email','whatsapp') OR n.read_at IS NULL)
    ORDER BY j.priority DESC, j.next_attempt_at, j.created_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.notification_jobs j
  SET state = 'claimed',
      claimed_at = now(),
      claim_token = p_worker,
      attempt_count = j.attempt_count + 1,
      updated_at = now()
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION public.try_acquire_notification_drain_lease(
  p_lease_name text,
  p_interval_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  INSERT INTO public.notification_drain_leases (lease_name, available_at, updated_at)
  VALUES (
    p_lease_name,
    now() + make_interval(secs => LEAST(GREATEST(p_interval_seconds, 5), 3600)),
    now()
  )
  ON CONFLICT (lease_name) DO UPDATE SET
    available_at = EXCLUDED.available_at,
    updated_at = now()
  WHERE notification_drain_leases.available_at <= now()
  RETURNING true INTO v_acquired;

  RETURN COALESCE(v_acquired, false);
END $$;

REVOKE ALL ON FUNCTION public.claim_notification_jobs(integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_notification_drain_lease(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(integer, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_notification_drain_lease(text, integer)
  TO service_role;
