import type { ConversationMessage } from '@/types/database'
import {
  addCoachWorkingTime,
  COACH_RESPONSE_TARGET_MS,
  getCoachWorkingHoursStatus,
} from '@/lib/coach-working-hours'

export { COACH_RESPONSE_TARGET_MS } from '@/lib/coach-working-hours'

export function getCoachResponseTarget(messages: ConversationMessage[]): {
  startedAt: number
  deadline: number
  unansweredCount: number
} | null {
  const latestCoachAt = messages.reduce(
    (latest, message) =>
      message.sender_type === 'coach'
        ? Math.max(latest, new Date(message.created_at).getTime())
        : latest,
    0
  )
  const unanswered = messages.filter(
    (message) =>
      message.sender_type === 'client' &&
      message.message_type !== 'system' &&
      new Date(message.created_at).getTime() > latestCoachAt
  )
  if (unanswered.length === 0) return null

  const requestedAt = new Date(unanswered[0].created_at)
  const workingHours = getCoachWorkingHoursStatus(requestedAt)
  const startedAt = workingHours.isOpen
    ? requestedAt.getTime()
    : workingHours.nextOpensAt.getTime()
  return {
    startedAt,
    deadline: addCoachWorkingTime(startedAt, COACH_RESPONSE_TARGET_MS).getTime(),
    unansweredCount: unanswered.length,
  }
}
