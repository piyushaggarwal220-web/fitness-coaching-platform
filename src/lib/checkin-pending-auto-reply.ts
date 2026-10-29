type AutoReplyQueueFields = {
  checkin_type?: string | null
  auto_reply_at?: string | null
  auto_replied_at?: string | null
  reviewed?: boolean | null
}

/** Cron will deliver the reply — hide from the coach manual work queue. */
export function isCheckinPendingAutoReply(checkin: AutoReplyQueueFields): boolean {
  return !checkin.reviewed && checkin.auto_reply_at != null && checkin.auto_replied_at == null
}

/**
 * True when a submitted check-in still needs a coach reply.
 * Mid-week rows feed Sunday's next-week plan and are never coach-response work.
 */
export function checkinNeedsCoachResponse(checkin: AutoReplyQueueFields): boolean {
  if (checkin.reviewed) return false
  if (checkin.checkin_type === 'mid_week') return false
  if (isCheckinPendingAutoReply(checkin)) return false
  return checkin.auto_reply_at == null
}
