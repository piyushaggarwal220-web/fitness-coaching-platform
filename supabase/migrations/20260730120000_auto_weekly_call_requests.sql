-- Auto weekly coach call bookings for 12-month plans (coaching Day 7).

ALTER TABLE public.call_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS coaching_week integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'call_requests_source_check'
  ) THEN
    ALTER TABLE public.call_requests
      ADD CONSTRAINT call_requests_source_check
      CHECK (source IN ('manual', 'auto_weekly'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'call_requests_auto_weekly_week_check'
  ) THEN
    ALTER TABLE public.call_requests
      ADD CONSTRAINT call_requests_auto_weekly_week_check
      CHECK (
        (source = 'auto_weekly' AND coaching_week IS NOT NULL AND coaching_week >= 1)
        OR (source <> 'auto_weekly')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS call_requests_one_auto_weekly_per_client_week
  ON public.call_requests(client_id, coaching_week)
  WHERE source = 'auto_weekly' AND coaching_week IS NOT NULL;

CREATE INDEX IF NOT EXISTS call_requests_auto_weekly_queue_idx
  ON public.call_requests(source, coaching_week, requested_at)
  WHERE source = 'auto_weekly';
