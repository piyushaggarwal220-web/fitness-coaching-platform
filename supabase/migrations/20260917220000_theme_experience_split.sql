-- Theme experience split: AI coach for new clients, Instant feature gates + lifetime unlocks.

alter table public.profiles
  add column if not exists coach_service text
    check (coach_service is null or coach_service in ('human', 'ai'));

alter table public.profiles
  add column if not exists instant_gates_enabled boolean not null default false;

alter table public.profiles
  add column if not exists addon_tracker_entitled boolean not null default false;

alter table public.profiles
  add column if not exists addon_journey_entitled boolean not null default false;

alter table public.profiles
  add column if not exists addon_ai_chat_entitled boolean not null default false;

comment on column public.profiles.coach_service is
  'human = legacy assigned coach chat; ai = in-app AI coach for new clients.';

comment on column public.profiles.instant_gates_enabled is
  'When true, Instant-only clients must unlock tracker / journey / AI chat add-ons.';

comment on column public.profiles.addon_tracker_entitled is
  'Lifetime Instant unlock: daily tracker + check-ins.';

comment on column public.profiles.addon_journey_entitled is
  'Lifetime Instant unlock: journey section.';

comment on column public.profiles.addon_ai_chat_entitled is
  'Lifetime Instant unlock: AI coach chat.';

-- Grandfather: anyone who already has a coach stays on human coaching.
update public.profiles
set coach_service = 'human'
where coach_id is not null
  and coach_service is null;

-- Grandfather Instant buyers who already purchased digital plans before this cutover:
-- leave instant_gates_enabled = false so tracker / journey / chat stay open.

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'insert' then
    new.payment_confirmed := false;
    new.access_source := null;
    new.plan_delivered := false;
    new.checkin_schedule_started_at := null;
    new.supplement_protocol_entitled := false;
    new.anxiety_protocol_entitled := false;
    new.face_maxxing_entitled := false;
    new.exercise_library_entitled := false;
    new.instant_gates_enabled := false;
    new.addon_tracker_entitled := false;
    new.addon_journey_entitled := false;
    new.addon_ai_chat_entitled := false;
    new.coach_service := null;
    if new.coach_id is not null then
      new.coach_id := null;
    end if;
    return new;
  end if;

  new.payment_confirmed := old.payment_confirmed;
  new.access_source := old.access_source;
  new.plan_delivered := exists (
    select 1 from plans
    where client_id = old.id and active = true
  );
  new.checkin_schedule_started_at := coalesce(
    old.checkin_schedule_started_at,
    (
      select public.first_coaching_day_start(min(delivered_at))
      from plans
      where client_id = old.id and delivered_at is not null
    )
  );
  new.coach_id := old.coach_id;
  new.role := old.role;
  new.supplement_protocol_entitled := old.supplement_protocol_entitled;
  new.anxiety_protocol_entitled := old.anxiety_protocol_entitled;
  new.face_maxxing_entitled := old.face_maxxing_entitled;
  new.exercise_library_entitled := old.exercise_library_entitled;
  new.instant_gates_enabled := old.instant_gates_enabled;
  new.addon_tracker_entitled := old.addon_tracker_entitled;
  new.addon_journey_entitled := old.addon_journey_entitled;
  new.addon_ai_chat_entitled := old.addon_ai_chat_entitled;
  new.coach_service := old.coach_service;
  return new;
end;
$$;

comment on function public.protect_profile_privileged_fields() is
  'Blocks non-admin/non-service entitlement, coach_service, and Instant gate flag changes.';

-- AI coach chat history (new clients / Instant unlock).
create table if not exists public.ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_coach_messages_client_created_idx
  on public.ai_coach_messages (client_id, created_at);

alter table public.ai_coach_messages enable row level security;

drop policy if exists ai_coach_messages_select_own on public.ai_coach_messages;
create policy ai_coach_messages_select_own
  on public.ai_coach_messages
  for select
  using (auth.uid() = client_id or public.is_platform_admin());

-- Inserts go through service role from the API route only.
drop policy if exists ai_coach_messages_no_client_write on public.ai_coach_messages;
create policy ai_coach_messages_no_client_write
  on public.ai_coach_messages
  for insert
  with check (false);

drop policy if exists ai_coach_messages_no_client_update on public.ai_coach_messages;
create policy ai_coach_messages_no_client_update
  on public.ai_coach_messages
  for update
  using (false);

drop policy if exists ai_coach_messages_no_client_delete on public.ai_coach_messages;
create policy ai_coach_messages_no_client_delete
  on public.ai_coach_messages
  for delete
  using (false);
