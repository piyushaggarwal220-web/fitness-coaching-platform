import type { ConversationMessage } from '@/types/database'

export const COACH_RESPONSE_TARGET_MS = 2 * 60 * 60 * 1000

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

  const startedAt = new Date(unanswered[0].created_at).getTime()
  return {
    startedAt,
    deadline: startedAt + COACH_RESPONSE_TARGET_MS,
    unansweredCount: unanswered.length,
  }
}
