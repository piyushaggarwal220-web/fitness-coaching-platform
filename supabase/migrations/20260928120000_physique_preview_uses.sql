-- One personalised physique preview per visitor per India calendar day.
-- Rows store a hash of the visitor id and the plan they previewed. No photos.

CREATE TABLE IF NOT EXISTS public.physique_preview_uses (
  visitor_key text NOT NULL,
  used_on date NOT NULL,
  plan_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_key, used_on)
);

ALTER TABLE public.physique_preview_uses ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role on the server may read or write.
