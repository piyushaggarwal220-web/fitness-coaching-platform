-- Client-written detailed goals (onboarding + profile). Used by AI for journey planning.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_goal_details text;

COMMENT ON COLUMN public.profiles.client_goal_details IS
  'Client description of goals, timeline, and preferred journey (e.g. fat loss then reverse). Injected into AI prompts.';
