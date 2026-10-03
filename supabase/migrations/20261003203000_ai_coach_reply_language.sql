alter table public.ai_coach_memory
  add column if not exists reply_language text not null default 'hinglish';

alter table public.ai_coach_memory
  drop constraint if exists ai_coach_memory_reply_language_check;

alter table public.ai_coach_memory
  add constraint ai_coach_memory_reply_language_check
  check (reply_language in ('hinglish', 'english', 'hindi_script'));
