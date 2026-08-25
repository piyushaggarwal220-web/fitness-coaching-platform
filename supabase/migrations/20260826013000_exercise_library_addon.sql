-- Exercise library add-on: form videos in the workout tracker.

alter table public.profiles
  add column if not exists exercise_library_entitled boolean not null default false;

comment on column public.profiles.exercise_library_entitled is
  'Client purchased the exercise library add-on and may load form videos.';

comment on column public.purchases.checkout_addon_ids is
  'Paid checkout add-on ids: testo_boost, anxiety_removal, face_maxxing, exercise_library.';

update public.profiles p
set exercise_library_entitled = true
where exists (
  select 1 from public.purchases pu
  where pu.user_id = p.id
    and pu.status = 'captured'
    and 'exercise_library' = any (pu.checkout_addon_ids)
);

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
  return new;
end;
$$;

comment on function public.protect_profile_privileged_fields() is
  'Blocks non-admin/non-service entitlement and assignment changes, including paid add-on flags.';
