-- Pending Smart Coach profile update waiting for the client to reply YES.
alter table public.ai_coach_memory
  add column if not exists pending_profile_change jsonb;

comment on column public.ai_coach_memory.pending_profile_change is
  'Optional profile patch proposed in Smart Coach chat until the client confirms. Never stores payment, role, or coach fields.';
