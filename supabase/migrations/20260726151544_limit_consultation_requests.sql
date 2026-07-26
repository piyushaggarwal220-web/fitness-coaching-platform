-- Store Shopify "Talk to a coach" submissions in the app database so the
-- lifetime limit is enforced independently of the browser.
CREATE TABLE public.consultation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_key text NOT NULL,
  idempotency_key uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone_e164 text NOT NULL,
  source text NOT NULL DEFAULT 'talk_to_a_coach',
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultation_requests_person_key_format
    CHECK (person_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT consultation_requests_name_length
    CHECK (char_length(name) BETWEEN 2 AND 100),
  CONSTRAINT consultation_requests_email_length
    CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT consultation_requests_phone_length
    CHECK (char_length(phone_e164) BETWEEN 9 AND 16),
  CONSTRAINT consultation_requests_source
    CHECK (source = 'talk_to_a_coach'),
  CONSTRAINT consultation_requests_ip_hash_format
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT consultation_requests_idempotency_key_unique
    UNIQUE (idempotency_key)
);

CREATE INDEX consultation_requests_person_created_idx
  ON public.consultation_requests (person_key, created_at DESC);

CREATE INDEX consultation_requests_ip_created_idx
  ON public.consultation_requests (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consultation_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.consultation_requests TO service_role;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- Serialize inserts for one normalized phone number. The trigger makes the
-- two-submission rule atomic even when requests arrive from parallel tabs.
CREATE OR REPLACE FUNCTION private.enforce_consultation_request_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  request_count integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.person_key, 0)
  );

  SELECT count(*)
  INTO request_count
  FROM public.consultation_requests
  WHERE person_key = NEW.person_key;

  IF request_count >= 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CONSULTATION_REQUEST_LIMIT_REACHED';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_consultation_request_limit() FROM PUBLIC;

CREATE TRIGGER consultation_requests_enforce_lifetime_limit
  BEFORE INSERT ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_consultation_request_limit();
