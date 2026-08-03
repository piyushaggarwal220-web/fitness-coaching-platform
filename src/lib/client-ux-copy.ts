import type { CheckinType } from '@/types/database'
import type { CheckinTaskStatus } from '@/lib/checkin-schedule'

/** Plain-language labels for the client app (avoid coach/admin jargon). */

export function clientCheckinTypeLabel(type: CheckinType): string {
  return type === 'mid_week' ? 'Mid-week update' : 'Weekly check-in'
}

export function clientCheckinStatusLabel(status: CheckinTaskStatus): string {
  return {
    completed: 'Done',
    upcoming: 'Coming up',
    available: 'Ready now',
    missed: 'Window closed',
    awaiting_review: 'Coach is reviewing',
  }[status]
}

export function clientCheckinShortHint(type: CheckinType): string {
  return type === 'mid_week'
    ? 'Quick update for your coach — ratings and notes only.'
    : 'Share measurements, photos, and how the week went.'
}

export function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
