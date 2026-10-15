-- How far a www.lurvox.in visit scrolled. Insert-only from the storefront.
-- No read policy for anon: reports use the service role.

CREATE TABLE IF NOT EXISTS public.landing_dropoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  section_key text NOT NULL,
  section_index smallint NOT NULL,
  section_label text NOT NULL,
  source text NOT NULL,
  path text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_dropoff_session CHECK (session_id ~ '^[a-zA-Z0-9]{16,64}$'),
  CONSTRAINT landing_dropoff_source CHECK (source IN ('ad', 'other')),
  CONSTRAINT landing_dropoff_path CHECK (char_length(path) BETWEEN 1 AND 120 AND path LIKE '/%'),
  CONSTRAINT landing_dropoff_section CHECK (
    (section_index = 0 AND section_key = 'hero' AND section_label = 'Hero')
    OR (section_index = 1 AND section_key = 'why' AND section_label = 'Why you won''t fail')
    OR (section_index = 2 AND section_key = 'system' AND section_label = 'What you get')
    OR (section_index = 3 AND section_key = 'coaching' AND section_label = 'Coaches')
    OR (section_index = 4 AND section_key = 'method' AND section_label = 'How it works')
    OR (section_index = 5 AND section_key = 'pricing' AND section_label = 'Plans')
    OR (section_index = 6 AND section_key = 'faq' AND section_label = 'Questions')
    OR (section_index = 7 AND section_key = 'close' AND section_label = 'Closing offer')
  ),
  CONSTRAINT landing_dropoff_session_section UNIQUE (session_id, section_key)
);

CREATE INDEX IF NOT EXISTS landing_dropoff_created_idx
  ON public.landing_dropoff (created_at);

ALTER TABLE public.landing_dropoff ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.landing_dropoff FROM anon, authenticated;
GRANT INSERT ON public.landing_dropoff TO anon, authenticated;

DROP POLICY IF EXISTS landing_dropoff_insert ON public.landing_dropoff;
CREATE POLICY landing_dropoff_insert
  ON public.landing_dropoff
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
