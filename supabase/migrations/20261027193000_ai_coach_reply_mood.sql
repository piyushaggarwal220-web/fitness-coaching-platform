-- Client-chosen Smart Coach mood. auto follows the chat. Service role writes it.
alter table public.ai_coach_memory
  add column if not exists reply_mood text not null default 'auto';

alter table public.ai_coach_memory
  drop constraint if exists ai_coach_memory_reply_mood_check;

alter table public.ai_coach_memory
  add constraint ai_coach_memory_reply_mood_check
  check (reply_mood in ('auto', 'calm', 'strict', 'friendly', 'short', 'fired_up'));

comment on column public.ai_coach_memory.reply_mood is
  'Client-chosen Smart Coach mood. auto follows the chat. Writes are service role.';
