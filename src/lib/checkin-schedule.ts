import type { Checkin, CheckinType } from '@/types/database'

export const MID_WEEK_DAY = 3
export const WEEKLY_DAY = 7
export const COACHING_WEEK_LENGTH = 7

export type CheckinTaskStatus = 'available' | 'completed' | 'missed' | 'upcoming' | 'awaiting_review'

export type ScheduledCheckin = {
  type: CheckinType
  coachingWeek: number
  coachingDay: number
  dueDate: Date
  label: string
  href: string
}

export type CheckinTask = ScheduledCheckin & {
  status: CheckinTaskStatus
  checkinId?: string
  reviewed?: boolean
}

export type ClientCheckinSchedule = {
  coachingDay: number
  coachingWeek: number
  todayTasks: CheckinTask[]
  nextCheckin: ScheduledCheckin | null
  countdownMs: number | null
  countdownLabel: string | null
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Days since onboarding (1-indexed: day 1 = onboarding completion day). */
export function getCoachingDay(onboardingCompletedAt: string | Date, referenceDate: Date = new Date()): number {
  const start = startOfDay(new Date(onboardingCompletedAt))
  const today = startOfDay(referenceDate)
  const diffMs = today.getTime() - start.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1
}

export function getCoachingWeek(coachingDay: number): number {
  return Math.max(1, Math.ceil(coachingDay / COACHING_WEEK_LENGTH))
}

export function getCoachingDayInWeek(coachingDay: number): number {
  const mod = coachingDay % COACHING_WEEK_LENGTH
  return mod === 0 ? COACHING_WEEK_LENGTH : mod
}

/** Absolute coaching day number for a given week and in-week day (3 or 7). */
export function getAbsoluteCoachingDay(coachingWeek: number, dayInWeek: number): number {
  return (coachingWeek - 1) * COACHING_WEEK_LENGTH + dayInWeek
}

export function getDueDate(onboardingCompletedAt: string | Date, coachingWeek: number, dayInWeek: number): Date {
  const start = startOfDay(new Date(onboardingCompletedAt))
  const absoluteDay = getAbsoluteCoachingDay(coachingWeek, dayInWeek)
  return addDays(start, absoluteDay - 1)
}

export function buildScheduledCheckin(
  onboardingCompletedAt: string | Date,
  coachingWeek: number,
  type: CheckinType
): ScheduledCheckin {
  const dayInWeek = type === 'mid_week' ? MID_WEEK_DAY : WEEKLY_DAY
  const coachingDay = getAbsoluteCoachingDay(coachingWeek, dayInWeek)
  const dueDate = getDueDate(onboardingCompletedAt, coachingWeek, dayInWeek)
  return {
    type,
    coachingWeek,
    coachingDay,
    dueDate,
    label: type === 'mid_week'
      ? `Complete Day ${MID_WEEK_DAY} Check-in (Week ${coachingWeek})`
      : `Complete Weekly Check-in (Week ${coachingWeek})`,
    href: type === 'mid_week' ? '/checkin/mid-week' : '/checkin',
  }
}

type CheckinRef = Pick<Checkin, 'checkin_type' | 'coaching_week'> & Partial<Pick<Checkin, 'id' | 'reviewed'>>

function findSubmission(
  checkins: CheckinRef[],
  coachingWeek: number,
  type: CheckinType
): Pick<Checkin, 'id' | 'reviewed'> | undefined {
  const match = checkins.find((c) => c.coaching_week === coachingWeek && c.checkin_type === type)
  if (!match?.id) return undefined
  return { id: match.id, reviewed: match.reviewed ?? false }
}

function hasSubmission(checkins: CheckinRef[], coachingWeek: number, type: CheckinType): boolean {
  return checkins.some((c) => c.coaching_week === coachingWeek && c.checkin_type === type)
}

function resolveTaskStatus(
  scheduled: ScheduledCheckin,
  submission: Pick<Checkin, 'id' | 'reviewed'> | undefined,
  today: Date
): CheckinTask {
  if (submission) {
    return {
      ...scheduled,
      status: submission.reviewed ? 'completed' : 'awaiting_review',
      checkinId: submission.id,
      reviewed: submission.reviewed,
    }
  }

  const todayStart = startOfDay(today).getTime()
  const dueStart = startOfDay(scheduled.dueDate).getTime()

  if (todayStart === dueStart) {
    return { ...scheduled, status: 'available' }
  }
  if (todayStart > dueStart) {
    return { ...scheduled, status: 'missed' }
  }
  return { ...scheduled, status: 'upcoming' }
}

/** Build schedule state for the client dashboard. */
export function getClientCheckinSchedule(
  onboardingCompletedAt: string | Date,
  checkins: CheckinRef[],
  referenceDate: Date = new Date()
): ClientCheckinSchedule {
  const coachingDay = getCoachingDay(onboardingCompletedAt, referenceDate)
  const coachingWeek = getCoachingWeek(coachingDay)

  const currentWeekTypes: CheckinType[] = ['mid_week', 'weekly']
  const todayTasks: CheckinTask[] = []

  for (const type of currentWeekTypes) {
    const scheduled = buildScheduledCheckin(onboardingCompletedAt, coachingWeek, type)
    const submission = findSubmission(checkins, coachingWeek, type)
    const task = resolveTaskStatus(scheduled, submission, referenceDate)
    if (task.status === 'available' || task.status === 'awaiting_review') {
      todayTasks.push(task)
    }
  }

  let nextCheckin: ScheduledCheckin | null = null
  let countdownMs: number | null = null

  for (let week = coachingWeek; week <= coachingWeek + 52 && !nextCheckin; week++) {
    for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
      const scheduled = buildScheduledCheckin(onboardingCompletedAt, week, type)
      const submission = findSubmission(checkins, week, type)
      if (!submission && startOfDay(scheduled.dueDate) >= startOfDay(referenceDate)) {
        if (startOfDay(scheduled.dueDate).getTime() > startOfDay(referenceDate).getTime() || !nextCheckin) {
          if (!submission) {
            const task = resolveTaskStatus(scheduled, undefined, referenceDate)
            if (task.status === 'upcoming' || (task.status === 'available' && !todayTasks.some((t) => t.type === type && t.coachingWeek === week))) {
              nextCheckin = scheduled
              countdownMs = startOfDay(scheduled.dueDate).getTime() - startOfDay(referenceDate).getTime()
              break
            }
          }
        }
      }
    }
  }

  if (!nextCheckin) {
    const nextWeek = coachingWeek + 1
    nextCheckin = buildScheduledCheckin(onboardingCompletedAt, nextWeek, 'mid_week')
    countdownMs = startOfDay(nextCheckin.dueDate).getTime() - startOfDay(referenceDate).getTime()
  }

  const countdownLabel = countdownMs != null ? formatCountdown(countdownMs) : null

  return {
    coachingDay,
    coachingWeek,
    todayTasks,
    nextCheckin,
    countdownMs,
    countdownLabel,
  }
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Due now'
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Due today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function isCheckinAvailableToday(
  onboardingCompletedAt: string | Date,
  type: CheckinType,
  checkins: CheckinRef[],
  referenceDate: Date = new Date()
): boolean {
  const coachingWeek = getCoachingWeek(getCoachingDay(onboardingCompletedAt, referenceDate))
  if (hasSubmission(checkins, coachingWeek, type)) return false
  const scheduled = buildScheduledCheckin(onboardingCompletedAt, coachingWeek, type)
  return startOfDay(scheduled.dueDate).getTime() === startOfDay(referenceDate).getTime()
}

export type CoachCheckinQueueItem = {
  clientId: string
  clientName: string
  type: CheckinType
  coachingWeek: number
  coachingDay: number
  dueDate: Date
  status: 'pending_review' | 'completed' | 'missed' | 'due_today'
  checkinId?: string
  submittedAt?: string
}

/** Build coach queue including missed slots without submissions. */
export function getCoachCheckinQueue(
  clients: { id: string; name: string | null; email: string | null; onboarding_completed_at: string | null }[],
  checkins: Pick<Checkin, 'id' | 'client_id' | 'checkin_type' | 'coaching_week' | 'coaching_day' | 'reviewed' | 'submitted_at' | 'due_date'>[],
  referenceDate: Date = new Date()
): CoachCheckinQueueItem[] {
  const items: CoachCheckinQueueItem[] = []
  const todayStart = startOfDay(referenceDate)

  for (const client of clients) {
    if (!client.onboarding_completed_at) continue
    const coachingDay = getCoachingDay(client.onboarding_completed_at, referenceDate)
    const coachingWeek = getCoachingWeek(coachingDay)
    const clientName = client.name || client.email || 'Client'
    const clientCheckins = checkins.filter((c) => c.client_id === client.id)

    for (let week = 1; week <= coachingWeek; week++) {
      for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
        const scheduled = buildScheduledCheckin(client.onboarding_completed_at, week, type)
        const submission = clientCheckins.find((c) => c.coaching_week === week && c.checkin_type === type)
        const dueStart = startOfDay(scheduled.dueDate)

        if (submission) {
          items.push({
            clientId: client.id,
            clientName,
            type,
            coachingWeek: week,
            coachingDay: scheduled.coachingDay,
            dueDate: scheduled.dueDate,
            status: submission.reviewed ? 'completed' : 'pending_review',
            checkinId: submission.id,
            submittedAt: submission.submitted_at,
          })
        } else if (dueStart.getTime() < todayStart.getTime()) {
          items.push({
            clientId: client.id,
            clientName,
            type,
            coachingWeek: week,
            coachingDay: scheduled.coachingDay,
            dueDate: scheduled.dueDate,
            status: 'missed',
          })
        } else if (dueStart.getTime() === todayStart.getTime()) {
          items.push({
            clientId: client.id,
            clientName,
            type,
            coachingWeek: week,
            coachingDay: scheduled.coachingDay,
            dueDate: scheduled.dueDate,
            status: 'due_today',
          })
        }
      }
    }
  }

  return items.sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())
}

export function getCheckinTypeLabel(type: CheckinType): string {
  return type === 'mid_week' ? 'Day 3 Check-in' : 'Weekly Check-in'
}

export function buildCheckinSummary(checkin: Partial<Checkin>): string {
  const parts: string[] = []
  if (checkin.weight != null) parts.push(`Weight: ${checkin.weight} kg`)
  if (checkin.diet_adherence != null) parts.push(`Diet: ${checkin.diet_adherence}/10`)
  if (checkin.workout_adherence != null) parts.push(`Workout: ${checkin.workout_adherence}/10`)
  if (checkin.energy_level != null) parts.push(`Energy: ${checkin.energy_level}/10`)
  if (checkin.sleep_quality != null) parts.push(`Sleep: ${checkin.sleep_quality}/10`)
  if (checkin.stress_level != null) parts.push(`Stress: ${checkin.stress_level}/10`)
  if (checkin.hunger_level != null) parts.push(`Hunger: ${checkin.hunger_level}/10`)
  if (checkin.motivation_level != null) parts.push(`Motivation: ${checkin.motivation_level}/10`)
  if (checkin.pain_injuries) parts.push(`Pain/injuries: ${checkin.pain_injuries}`)
  if (checkin.notes) parts.push(checkin.notes)
  return parts.join(' · ') || 'Weekly check-in submitted'
}
