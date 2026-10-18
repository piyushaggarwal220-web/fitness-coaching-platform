-- Marks how far the running Smart Coach proceedings summary has read.
-- Turns newer than this, outside the live window, are folded in on the next pass.
alter table public.ai_coach_memory
  add column if not exists summarized_through timestamptz;
