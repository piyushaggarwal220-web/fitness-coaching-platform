import type { SupabaseClient } from '@supabase/supabase-js'
import type { Checkin, CheckinType, OnboardingProfile } from '@/types/database'
import type { PlanChangeRequestRow } from '@/lib/plan-change-requests'
import {
  buildScheduledCheckin,
  getActiveCoachingWeek,
  getCoachingDay,
  getCoachingWeek,
  getCheckinTypeDisplayName,
  isCheckinSubmissionWindowClosed,
} from '@/lib/checkin-schedule'

export type ClientJourneyInput = {
  profile: Pick<
    OnboardingProfile,
    | 'checkin_schedule_started_at'
    | 'name'
    | 'journey_goal'
    | 'journey_summary'
    | 'client_goal_details'
  >
  /** All check-ins for the client (any order). */
  checkins: Checkin[]
  /** Recent plan-change requests (any order). */
  planChangeRequests?: PlanChangeRequestRow[]
  /** The check-in this plan is being generated for, if any. */
  currentCheckin?: Checkin | null
  referenceDate?: Date
  tracker?: {
    daysLogged: number
    daysUsed: number
    daysTrained: number
    avgPercent: number | null
  } | null
}

const MAX_MISSED_LISTED = 6
const MAX_REQUESTS_LISTED = 5
const REQUEST_TEXT_CAP = 240

function truncate(text: string, cap: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > cap ? `${trimmed.slice(0, cap - 1)}…` : trimmed
}

function coachingWeekOf(checkin: Checkin): number | null {
  if (checkin.coaching_week != null) return checkin.coaching_week
  if (checkin.coaching_day != null) return getCoachingWeek(checkin.coaching_day)
  return null
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'unknown date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'unknown date'
  return d.toISOString().slice(0, 10)
}

function hasSubmissionForSlot(checkins: Checkin[], week: number, type: CheckinType): boolean {
  return checkins.some((c) => c.checkin_type === type && coachingWeekOf(c) === week)
}

function buildMissedList(
  checkins: Checkin[],
  scheduleStartedAt: string,
  upToWeek: number,
  referenceDate: Date
): string[] {
  const missed: string[] = []
  for (let week = 1; week < upToWeek; week++) {
    for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
      if (hasSubmissionForSlot(checkins, week, type)) continue
      const scheduled = buildScheduledCheckin(scheduleStartedAt, week, type)
      if (isCheckinSubmissionWindowClosed(scheduled.dueDate, referenceDate, type)) {
        missed.push(`Week ${week} ${getCheckinTypeDisplayName(type)}`)
      }
    }
  }
  return missed
}

function buildWeightTrend(checkins: Checkin[]): string | null {
  const weighed = checkins
    .filter((c) => typeof c.weight === 'number' && c.weight! > 0)
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
  if (weighed.length === 0) return null
  const first = weighed[0]!
  const last = weighed[weighed.length - 1]!
  if (weighed.length === 1) {
    return `Latest weight ${last.weight}kg (${formatDate(last.submitted_at)}); no prior weight to compare.`
  }
  const delta = Math.round((last.weight! - first.weight!) * 10) / 10
  const direction = delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat'
  return `Weight ${direction} ${Math.abs(delta)}kg over ${weighed.length} weigh-ins (${first.weight}kg on ${formatDate(
    first.submitted_at
  )} → ${last.weight}kg on ${formatDate(last.submitted_at)}).`
}

function statusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'APPROVED (already applied — keep respecting this)'
    case 'declined':
      return 'declined'
    case 'draft_ready':
    case 'in_review':
    case 'generating':
      return 'in progress'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
    default:
      return status
  }
}

/** Pure builder — produces a coach-context snapshot of where the client is in their journey. */
export function buildClientJourneySnapshot(input: ClientJourneyInput): string {
  const referenceDate = input.referenceDate ?? new Date()
  const anchor = input.profile.checkin_schedule_started_at ?? null
  const checkins = input.checkins ?? []
  const requests = input.planChangeRequests ?? []

  const lines: string[] = ['## Client Journey Snapshot (authoritative — read before writing the plan)']

  const journeyGoal = input.profile.journey_goal?.trim()
  const journeySummary = input.profile.journey_summary?.trim()
  const clientGoalDetails = input.profile.client_goal_details?.trim()
  if (clientGoalDetails) {
    lines.push(
      `- **Client goal description (their words — infer journey type from this):** ${truncate(clientGoalDetails, 900)}`
    )
  }
  if (journeyGoal) {
    lines.push(
      `- **Journey goal (coach-defined roadmap — honor across diet/workout updates):** ${truncate(journeyGoal, 900)}`
    )
  }
  if (journeySummary) {
    lines.push(
      `- **Current journey status (where they are right now in that roadmap):** ${truncate(journeySummary, 900)}`
    )
  }
  if (journeyGoal || journeySummary) {
    lines.push(
      '- When calories or macros change, align with the journey goal and current status above. Do not contradict an active reverse-diet or fat-loss phase unless the summary says the phase changed.'
    )
  }

  // Where they are in the program.
  const currentWeek =
    (input.currentCheckin ? coachingWeekOf(input.currentCheckin) : null) ??
    (anchor ? getActiveCoachingWeek(checkins, anchor, referenceDate) : null)

  if (currentWeek != null) {
    lines.push(`- This plan is for coaching WEEK ${currentWeek}. Write as week ${currentWeek}, not week 1.`)
  }
  if (anchor) {
    const calendarDay = getCoachingDay(anchor, referenceDate)
    const calendarWeek = getCoachingWeek(calendarDay)
    lines.push(
      `- Program timeline: day ${calendarDay} (calendar week ${calendarWeek}) since first plan delivery on ${formatDate(
        anchor
      )}.`
    )
  }

  const submittedCount = checkins.length
  const weeklyCount = checkins.filter((c) => c.checkin_type === 'weekly').length
  const midWeekCount = checkins.filter((c) => c.checkin_type === 'mid_week').length
  lines.push(
    `- Check-ins submitted so far: ${submittedCount} (${weeklyCount} weekly, ${midWeekCount} mid-week)${
      submittedCount === 0 ? ' (this may be their first plan / no history yet)' : ''
    }.`
  )

  if (input.tracker) {
    const avg = input.tracker.avgPercent != null ? `${input.tracker.avgPercent}% avg` : 'no scores yet'
    lines.push(
      `- Daily tracker: ${input.tracker.daysUsed} days used of ${input.tracker.daysLogged} logged (${avg}); training logged on ${input.tracker.daysTrained} days.`
    )
  }

  const current = input.currentCheckin
  if (current) {
    lines.push(
      `- Latest check-in days followed: diet ${current.days_followed_diet ?? 'n/a'}, workout ${current.days_followed_workout ?? 'n/a'}, sleep ${current.days_followed_sleep ?? 'n/a'}, water ${current.days_followed_water ?? 'n/a'}, steps ${current.days_followed_steps ?? 'n/a'}.`
    )
  }

  // Missed / skipped check-ins.
  if (anchor && currentWeek && currentWeek > 1) {
    const missed = buildMissedList(checkins, anchor, currentWeek, referenceDate)
    if (missed.length > 0) {
      const shown = missed.slice(0, MAX_MISSED_LISTED)
      const extra = missed.length - shown.length
      lines.push(
        `- Skipped/missed check-ins: ${shown.join(', ')}${extra > 0 ? `, +${extra} more` : ''}. ` +
          'Do not assume perfect adherence — acknowledge gaps gently and keep changes conservative where data is missing.'
      )
    } else {
      lines.push('- No missed check-ins on record — client has been consistent.')
    }
  }

  // Weight trend.
  const trend = buildWeightTrend(checkins)
  if (trend) lines.push(`- ${trend}`)

  // Past requests that must be respected.
  if (requests.length > 0) {
    const sorted = [...requests].sort(
      (a, b) => new Date(b.locked_at ?? b.created_at).getTime() - new Date(a.locked_at ?? a.created_at).getTime()
    )
    const shown = sorted.slice(0, MAX_REQUESTS_LISTED)
    lines.push('- Past client change requests (respect standing/approved ones, do not undo them):')
    for (const req of shown) {
      lines.push(
        `  • [${formatDate(req.locked_at ?? req.created_at)} · ${req.scope} · ${statusLabel(req.status)}] ${truncate(
          req.request_text,
          REQUEST_TEXT_CAP
        )}`
      )
    }
  }

  // Recent free-text asks from the latest few check-ins.
  const recentAsks = checkins
    .slice()
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .slice(0, 3)
    .flatMap((c) => {
      const bits: string[] = []
      if (c.questions_for_coach?.trim()) bits.push(`Q: ${truncate(c.questions_for_coach, 160)}`)
      if (c.pain_injuries?.trim()) bits.push(`Pain/injury: ${truncate(c.pain_injuries, 120)}`)
      if (c.adherence_struggles?.trim()) bits.push(`Struggle: ${truncate(c.adherence_struggles, 120)}`)
      return bits
    })
  if (recentAsks.length > 0) {
    lines.push('- Recent client notes to honor:')
    for (const ask of recentAsks.slice(0, 5)) lines.push(`  • ${ask}`)
  }

  if (lines.length === 1) {
    lines.push('- No journey history available yet. Treat this as an early plan for the client.')
  }

  return lines.join('\n')
}

/** Loads the data needed and returns the journey snapshot text. Safe: returns '' on failure. */
export async function loadClientJourneySnapshot(
  admin: SupabaseClient,
  params: {
    clientId: string
    profile: Pick<
      OnboardingProfile,
      | 'checkin_schedule_started_at'
      | 'name'
      | 'journey_goal'
      | 'journey_summary'
      | 'client_goal_details'
    >
    currentCheckin?: Checkin | null
    referenceDate?: Date
  }
): Promise<string> {
  try {
    const [checkinsResult, requestsResult, trackerResult] = await Promise.all([
      admin
        .from('checkins')
        .select('*')
        .eq('client_id', params.clientId)
        .order('submitted_at', { ascending: true }),
      admin
        .from('plan_change_requests')
        .select('*')
        .eq('client_id', params.clientId)
        .order('locked_at', { ascending: false })
        .limit(20),
      admin
        .from('daily_tracker_days')
        .select('overall_percent, scores')
        .eq('client_id', params.clientId),
    ])

    const trackerRows = trackerResult.data ?? []
    const percents = trackerRows
      .map((row) => row.overall_percent as number | null)
      .filter((v): v is number => v != null)
    const daysTrained = trackerRows.filter((row) => {
      const scores = row.scores as { workout?: number } | null
      return (scores?.workout ?? 0) > 0
    }).length

    return buildClientJourneySnapshot({
      profile: params.profile,
      checkins: (checkinsResult.data as Checkin[] | null) ?? [],
      planChangeRequests: (requestsResult.data as PlanChangeRequestRow[] | null) ?? [],
      currentCheckin: params.currentCheckin ?? null,
      referenceDate: params.referenceDate,
      tracker: {
        daysLogged: trackerRows.length,
        daysUsed: percents.filter((p) => p > 0).length,
        daysTrained,
        avgPercent: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
      },
    })
  } catch (err) {
    console.error('[client-journey] failed to load snapshot', err)
    return ''
  }
}
