-- Rolling private memory for Smart Coach. Service role writes it. Clients can read their own row.
create table if not exists public.ai_coach_memory (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  summary text not null default '',
  mood text not null default 'plain',
  updated_at timestamptz not null default now()
);

alter table public.ai_coach_memory enable row level security;

drop policy if exists ai_coach_memory_select_own on public.ai_coach_memory;
create policy ai_coach_memory_select_own
  on public.ai_coach_memory
  for select
  using (auth.uid() = client_id or public.is_platform_admin());

drop policy if exists ai_coach_memory_no_client_write on public.ai_coach_memory;
create policy ai_coach_memory_no_client_write
  on public.ai_coach_memory
  for insert
  with check (false);

drop policy if exists ai_coach_memory_no_client_update on public.ai_coach_memory;
create policy ai_coach_memory_no_client_update
  on public.ai_coach_memory
  for update
  using (false);

drop policy if exists ai_coach_memory_no_client_delete on public.ai_coach_memory;
create policy ai_coach_memory_no_client_delete
  on public.ai_coach_memory
  for delete
  using (false);
