-- Gate AI plan work when client metrics look impossible until the client confirms them.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS complexity_input_needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS complexity_input_review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.complexity_input_needs_review IS
  'When true, AI plan generation/section edits are blocked until the client confirms metrics';

COMMENT ON COLUMN public.profiles.complexity_input_review_reasons IS
  'JSON array of human-readable reasons the metrics need client confirmation';
