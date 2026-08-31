-- Coach-defined journey roadmap + current phase summary for AI plan context.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS journey_goal text,
  ADD COLUMN IF NOT EXISTS journey_summary text;

COMMENT ON COLUMN public.profiles.journey_goal IS
  'Long-term coaching roadmap (e.g. aggressive fat loss then reverse). Injected into every AI plan prompt.';
COMMENT ON COLUMN public.profiles.journey_summary IS
  'Current phase status updated after coach calls/check-ins. Injected into every AI plan prompt.';
