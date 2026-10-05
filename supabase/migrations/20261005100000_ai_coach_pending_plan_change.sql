-- Pending Smart Coach plan-edit proposal waiting for client YES in chat.
alter table public.ai_coach_memory
  add column if not exists pending_plan_change jsonb;

comment on column public.ai_coach_memory.pending_plan_change is
  'Optional {scope, requestText, createdAt} proposed in Smart Coach chat until the client confirms.';
