-- Fix PostgREST upsert onConflict: delivery_event_id needs a real UNIQUE constraint.
-- Partial unique indexes are not inferred by ON CONFLICT (delivery_event_id).

DROP INDEX IF EXISTS public.user_notifications_delivery_event_idx;

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_delivery_event_id_key;

-- PostgreSQL UNIQUE allows multiple NULLs, so legacy rows without an event remain valid.
ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_delivery_event_id_key UNIQUE (delivery_event_id);
