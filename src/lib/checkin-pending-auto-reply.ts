type AutoReplyQueueFields = {
  auto_reply_at?: string | null
  auto_replied_at?: string | null
  reviewed?: boolean | null
}

/** Cron will deliver the reply — hide from the coach manual work queue. */
export function isCheckinPendingAutoReply(checkin: AutoReplyQueueFields): boolean {
  return !checkin.reviewed && checkin.auto_reply_at != null && checkin.auto_replied_at == null
}
