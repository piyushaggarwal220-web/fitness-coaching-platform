/**
 * Explicit priority factors — no opaque AI score.
 *
 * Internal numeric priority (0–100, higher = more urgent):
 *   BLOCKED (+40) | DEADLINE (+0..25 by proximity) | BUSINESS_OBJECTIVE (+15)
 *   READY_STATE (+10) | USER_PRIORITY (+0..20) | SCHEDULED_TIME (+5 if due soon)
 *   TREND_FRESHNESS (+0..10)
 * Documented for operators; not a virality prediction.
 */

export type PriorityInput = {
  blocked: boolean
  deadline_at?: string | null
  business_objective_aligned?: boolean
  ready_for_user_action?: boolean
  user_priority?: number | null
  scheduled_for?: string | null
  trend_freshness_hours?: number | null
  now?: Date
}

export type PriorityResult = {
  score: number
  factors: string[]
}

export function computeContentPriority(input: PriorityInput): PriorityResult {
  const now = input.now ?? new Date()
  let score = 50
  const factors: string[] = []

  if (input.blocked) {
    score += 40
    factors.push('BLOCKED')
  }

  if (input.deadline_at) {
    const ms = new Date(input.deadline_at).getTime() - now.getTime()
    const hours = ms / 3_600_000
    if (hours < 0) {
      score += 25
      factors.push('DEADLINE_OVERDUE')
    } else if (hours < 24) {
      score += 20
      factors.push('DEADLINE_24H')
    } else if (hours < 72) {
      score += 12
      factors.push('DEADLINE_72H')
    } else {
      factors.push('DEADLINE')
    }
  }

  if (input.business_objective_aligned) {
    score += 15
    factors.push('BUSINESS_OBJECTIVE')
  }

  if (input.ready_for_user_action) {
    score += 10
    factors.push('READY_STATE')
  }

  if (input.user_priority != null && Number.isFinite(input.user_priority)) {
    const bump = Math.max(0, Math.min(20, Math.round(input.user_priority)))
    score += bump
    factors.push('USER_PRIORITY')
  }

  if (input.scheduled_for) {
    const hours = (new Date(input.scheduled_for).getTime() - now.getTime()) / 3_600_000
    if (hours >= 0 && hours < 6) {
      score += 5
      factors.push('SCHEDULED_TIME')
    } else {
      factors.push('SCHEDULED_TIME')
    }
  }

  if (input.trend_freshness_hours != null && input.trend_freshness_hours < 72) {
    const bump = Math.max(0, Math.min(10, Math.round((72 - input.trend_freshness_hours) / 7.2)))
    score += bump
    factors.push('TREND_FRESHNESS')
  }

  return { score: Math.max(0, Math.min(100, score)), factors }
}
