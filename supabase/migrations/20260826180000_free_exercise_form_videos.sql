-- 3 free form videos per person, lifetime. Full library remains a paid unlock.

create table if not exists public.exercise_form_free_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_key),
  constraint exercise_form_free_unlocks_key_len check (char_length(exercise_key) between 1 and 120)
);

comment on table public.exercise_form_free_unlocks is
  'Lifetime free form-video unlocks. Max 3 distinct exercises per person; the rest require the paid library.';

alter table public.exercise_form_free_unlocks enable row level security;

create or replace function public.claim_free_exercise_form(p_user_id uuid, p_exercise_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap constant int := 3;
  v_key text := trim(p_exercise_key);
  v_entitled boolean := false;
  v_used int := 0;
  v_exists boolean := false;
begin
  if p_user_id is null or v_key is null or v_key = '' then
    return jsonb_build_object(
      'allowed', false,
      'entitled', false,
      'used', 0,
      'remaining', v_cap,
      'claimed', false
    );
  end if;

  select coalesce(exercise_library_entitled, false)
    into v_entitled
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'entitled', false,
      'used', 0,
      'remaining', v_cap,
      'claimed', false
    );
  end if;

  if v_entitled then
    return jsonb_build_object(
      'allowed', true,
      'entitled', true,
      'used', 0,
      'remaining', v_cap,
      'claimed', false
    );
  end if;

  select exists (
    select 1
    from public.exercise_form_free_unlocks
    where user_id = p_user_id
      and exercise_key = v_key
  ) into v_exists;

  select count(*)::int
    into v_used
  from public.exercise_form_free_unlocks
  where user_id = p_user_id;

  if v_exists then
    return jsonb_build_object(
      'allowed', true,
      'entitled', false,
      'used', v_used,
      'remaining', greatest(v_cap - v_used, 0),
      'claimed', true
    );
  end if;

  if v_used >= v_cap then
    return jsonb_build_object(
      'allowed', false,
      'entitled', false,
      'used', v_used,
      'remaining', 0,
      'claimed', false
    );
  end if;

  insert into public.exercise_form_free_unlocks (user_id, exercise_key)
  values (p_user_id, v_key);

  v_used := v_used + 1;

  return jsonb_build_object(
    'allowed', true,
    'entitled', false,
    'used', v_used,
    'remaining', greatest(v_cap - v_used, 0),
    'claimed', true
  );
end;
$$;

comment on function public.claim_free_exercise_form(uuid, text) is
  'Atomically grants one of three lifetime free form videos, or allows replay of an already granted lift.';

revoke all on function public.claim_free_exercise_form(uuid, text) from public;
revoke all on function public.claim_free_exercise_form(uuid, text) from anon;
revoke all on function public.claim_free_exercise_form(uuid, text) from authenticated;
grant execute on function public.claim_free_exercise_form(uuid, text) to service_role;

revoke all on table public.exercise_form_free_unlocks from public;
revoke all on table public.exercise_form_free_unlocks from anon;
revoke all on table public.exercise_form_free_unlocks from authenticated;
