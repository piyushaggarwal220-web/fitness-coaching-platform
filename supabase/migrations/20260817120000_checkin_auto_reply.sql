-- Automated check-in replies.
--
-- Replies are scheduled 4-6 hours after a client submits and are never delivered between
-- 00:00 and 08:00 IST. The schedule lives on the row so any scheduler can drive the send and
-- so a coach answering first (reviewed = true) cancels the automated reply.

alter table public.checkins
  add column if not exists auto_reply_at timestamptz,
  add column if not exists auto_replied_at timestamptz;

comment on column public.checkins.auto_reply_at is
  'When the automated coach reply is due (4-6h post-submission, shifted out of 00:00-08:00 IST quiet hours).';
comment on column public.checkins.auto_replied_at is
  'Set when the automated reply was delivered. Null means a human reply, or still pending.';

-- The sweep looks for due, unreviewed, not-yet-auto-replied rows.
create index if not exists checkins_auto_reply_due_idx
  on public.checkins (auto_reply_at)
  where reviewed = false and auto_replied_at is null;

-- Catch up recent submissions so clients waiting right now still get a reply, spread over
-- 90 minutes rather than firing all at once. Older unreviewed check-ins stay with the coach.
update public.checkins
set auto_reply_at = now() + (random() * interval '90 minutes')
where reviewed = false
  and auto_reply_at is null
  and submitted_at > now() - interval '3 days';
