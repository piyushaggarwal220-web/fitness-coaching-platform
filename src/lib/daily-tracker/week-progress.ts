import type { TrackerCategoryScores, TrackerWeekDaySummary, TrackerWeekProgress } from './types'

export type SlimTrackerDay = {
  log_date: string
  coaching_day: number | null
  coaching_week: number | null
  overall_percent: number | null
  scores: TrackerCategoryScores | null
}

export function slimTrackerDay(row: SlimTrackerDay): TrackerWeekDaySummary {
  return {
    logDate: row.log_date,
    coachingDay: row.coaching_day,
    coachingWeek: row.coaching_week,
    overallPercent: row.overall_percent,
    diet: row.scores?.diet ?? null,
    workout: row.scores?.workout ?? null,
  }
}

function averagePercent(days: TrackerWeekDaySummary[]): number | null {
  const values = days
    .map((d) => d.overallPercent)
    .filter((v): v is number => v != null)
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function buildWeekProgress(
  rows: SlimTrackerDay[],
  todayKey: string,
  currentWeek: number
): { previousWeek: TrackerWeekProgress | null; recentDays: TrackerWeekDaySummary[] } {
  const days = rows
    .filter((row) => row.log_date <= todayKey)
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map(slimTrackerDay)

  const previousWeekNumber = currentWeek > 1 ? currentWeek - 1 : null
  const previousFromWeek =
    previousWeekNumber != null ? days.filter((d) => d.coachingWeek === previousWeekNumber) : []

  // Rows created before coaching_week was stored still need a last-week strip.
  const fallbackPrevious =
    previousFromWeek.length > 0
      ? previousFromWeek
      : days.filter((d) => d.logDate < todayKey).slice(-7)

  const previousWeek =
    fallbackPrevious.length > 0
      ? {
          week: previousWeekNumber ?? 0,
          average: averagePercent(fallbackPrevious),
          days: fallbackPrevious,
        }
      : null

  return { previousWeek, recentDays: days.slice(-14) }
}
