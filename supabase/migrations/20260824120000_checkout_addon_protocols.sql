-- Extra paid checkout add-ons (anxiety removal, face maxxing) alongside testo boost.
-- Entitlement lives on the purchase (what they paid) and the profile (what we owe).

alter table public.purchases
  add column if not exists checkout_addon_ids text[] not null default '{}';

comment on column public.purchases.checkout_addon_ids is
  'Paid checkout add-on ids: testo_boost, anxiety_removal, face_maxxing.';

alter table public.profiles
  add column if not exists anxiety_protocol_entitled boolean not null default false,
  add column if not exists face_maxxing_entitled boolean not null default false;

comment on column public.profiles.anxiety_protocol_entitled is
  'Client purchased the anxiety removal protocol add-on.';
comment on column public.profiles.face_maxxing_entitled is
  'Client purchased the face maxxing protocol add-on.';

alter table public.supplement_protocols
  add column if not exists addon_id text not null default 'testo_boost';

comment on column public.supplement_protocols.addon_id is
  'Which paid protocol this row is: testo_boost, anxiety_removal, or face_maxxing.';

drop index if exists public.supplement_protocols_client_idx;
drop index if exists public.supplement_protocols_client_idx;

create unique index if not exists supplement_protocols_client_addon_idx
  on public.supplement_protocols (client_id, addon_id);

update public.profiles p
set anxiety_protocol_entitled = true
where exists (
  select 1 from public.purchases pu
  where pu.user_id = p.id
    and pu.status = 'captured'
    and 'anxiety_removal' = any (pu.checkout_addon_ids)
);

update public.profiles p
set face_maxxing_entitled = true
where exists (
  select 1 from public.purchases pu
  where pu.user_id = p.id
    and pu.status = 'captured'
    and 'face_maxxing' = any (pu.checkout_addon_ids)
);
