-- Optional paid add-on: a personalised supplement protocol.
--
-- Recorded on the purchase (what they paid for) and on the profile (what we owe them), so the
-- deliverable survives independently of the payment row and can be regenerated if needed.

alter table public.purchases
  add column if not exists supplement_addon boolean not null default false,
  add column if not exists supplement_addon_paise integer not null default 0;

comment on column public.purchases.supplement_addon is
  'Client paid for the personalised supplement protocol add-on at checkout.';
comment on column public.purchases.supplement_addon_paise is
  'Amount of this purchase attributable to the supplement protocol add-on.';

alter table public.profiles
  add column if not exists supplement_protocol_entitled boolean not null default false;

comment on column public.profiles.supplement_protocol_entitled is
  'Client purchased the supplement protocol add-on and is owed the document.';

-- The generated document. One current protocol per client; regenerating replaces the content
-- and bumps the version so we keep an audit trail of what the client was shown.
create table if not exists public.supplement_protocols (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete set null,
  version integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  content text,
  error_message text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplement_protocols_client_idx
  on public.supplement_protocols (client_id);

alter table public.supplement_protocols enable row level security;

-- Clients read only their own protocol; writes are service-role only (generation pipeline).
drop policy if exists "clients read own supplement protocol" on public.supplement_protocols;
create policy "clients read own supplement protocol"
  on public.supplement_protocols
  for select
  using (auth.uid() = client_id);

drop policy if exists "coaches read assigned supplement protocols" on public.supplement_protocols;
create policy "coaches read assigned supplement protocols"
  on public.supplement_protocols
  for select
  using (
    exists (
      select 1
      from public.profiles client
      join public.coaches coach on coach.id = client.coach_id
      where client.id = public.supplement_protocols.client_id
        and coach.user_id = auth.uid()
    )
  );

-- Backfill entitlement for anyone who already paid for the add-on (none at launch, but keeps
-- the migration idempotent if it is re-run after the first sales land).
update public.profiles p
set supplement_protocol_entitled = true
where exists (
  select 1
  from public.purchases pu
  where pu.user_id = p.id
    and pu.supplement_addon = true
    and pu.status = 'captured'
);
