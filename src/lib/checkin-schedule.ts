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
  /** Calendar week from days since onboarding. */
  calendarCoachingWeek: number
  /** Week the client is currently working through for check-ins. */
  activeCoachingWeek: number
  /** Mid-week + weekly status for the active coaching week. */
  weekCheckins: CheckinTask[]
  todayTasks: CheckinTask[]
  nextCheckin: ScheduledCheckin | null
  nextCheckinStatus: CheckinTaskStatus | null
  countdownMs: number | null
  countdownLabel: string | null
  countdownDetailed: string | null
  /** @deprecated Use activeCoachingWeek */
  coachingWeek: number
  developmentScheduleMessage: string | null
}

export type CoachClientCheckinSummary = {
  clientId: string
  activeCoachingWeek: number
  nextCheckin: ScheduledCheckin | null
  nextCheckinStatus: CheckinTaskStatus | null
  countdownDetailed: string | null
  midWeekStatus: CheckinTaskStatus
  weeklyStatus: CheckinTaskStatus
}

export type CheckinScheduleOptions = {
  /** When true, treat current-week check-ins as available regardless of due date. */
  bypassSchedule?: boolean
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
      ? `Mid-Week Check-in (Week ${coachingWeek})`
      : `Weekly Check-in (Week ${coachingWeek})`,
    href: type === 'mid_week' ? '/checkin/mid-week' : '/checkin',
  }
}

type CheckinRef = Pick<Checkin, 'checkin_type' | 'coaching_week'> &
  Partial<Pick<Checkin, 'coaching_day' | 'id' | 'reviewed'>>

function inferCoachingWeekFromCheckin(checkin: CheckinRef): number | null {
  if (checkin.coaching_week != null) return checkin.coaching_week
  if (checkin.coaching_day != null) return getCoachingWeek(checkin.coaching_day)
  return null
}

function matchesScheduledSlot(
  checkin: CheckinRef,
  coachingWeek: number,
  type: CheckinType
): boolean {
  if (checkin.checkin_type !== type) return false
  if (checkin.coaching_week === coachingWeek) return true
  const inferredWeek = inferCoachingWeekFromCheckin(checkin)
  if (inferredWeek === coachingWeek) return true
  const expectedDay = getAbsoluteCoachingDay(coachingWeek, type === 'mid_week' ? MID_WEEK_DAY : WEEKLY_DAY)
  return checkin.coaching_day === expectedDay
}

function findSubmission(
  checkins: CheckinRef[],
  coachingWeek: number,
  type: CheckinType
): Pick<Checkin, 'id' | 'reviewed'> | undefined {
  const match = checkins.find((c) => matchesScheduledSlot(c, coachingWeek, type))
  if (!match?.id) return undefined
  return { id: match.id, reviewed: match.reviewed ?? false }
}

function hasSubmission(checkins: CheckinRef[], coachingWeek: number, type: CheckinType): boolean {
  return checkins.some((c) => matchesScheduledSlot(c, coachingWeek, type))
}

/** First coaching week that still has an incomplete check-in slot. */
export function getActiveCoachingWeek(
  checkins: CheckinRef[],
  onboardingCompletedAt?: string | Date | null,
  referenceDate: Date = new Date()
): number {
  for (let week = 1; week <= 520; week++) {
    for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
      if (!hasSubmission(checkins, week, type)) return week
    }
  }
  if (onboardingCompletedAt) {
    return getCoachingWeek(getCoachingDay(onboardingCompletedAt, referenceDate))
  }
  return 1
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

function findNextIncompleteCheckin(
  onboardingCompletedAt: string | Date,
  checkins: CheckinRef[],
  referenceDate: Date
): { scheduled: ScheduledCheckin; status: CheckinTaskStatus } | null {
  for (let week = 1; week <= 520; week++) {
    for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
      if (hasSubmission(checkins, week, type)) continue
      const scheduled = buildScheduledCheckin(onboardingCompletedAt, week, type)
      const status = resolveTaskStatus(scheduled, undefined, referenceDate).status
      return { scheduled, status }
    }
  }
  return null
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Due now'
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Due today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function formatDetailedCountdown(ms: number): string {
  if (ms <= 0) return 'Available now'
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  return parts.join(' ')
}

export function getCheckinStatusLabel(status: CheckinTaskStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'upcoming':
      return 'Upcoming'
    case 'available':
      return 'Available Today'
    case 'missed':
      return 'Overdue'
    case 'awaiting_review':
      return 'Awaiting Review'
    default:
      return status
  }
}

export function getCheckinTypeDisplayName(type: CheckinType): string {
  return type === 'mid_week' ? 'Mid-Week Check-in' : 'Weekly Check-in'
}

/** Build schedule state for the client dashboard. */
export function getClientCheckinSchedule(
  onboardingCompletedAt: string | Date,
  checkins: CheckinRef[],
  referenceDate: Date = new Date(),
  options?: CheckinScheduleOptions
): ClientCheckinSchedule {
  const bypassSchedule = options?.bypassSchedule === true
  const coachingDay = getCoachingDay(onboardingCompletedAt, referenceDate)
  const calendarCoachingWeek = getCoachingWeek(coachingDay)
  const activeCoachingWeek = getActiveCoachingWeek(checkins, onboardingCompletedAt, referenceDate)

  const weekCheckins: CheckinTask[] = []
  for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
    const scheduled = buildScheduledCheckin(onboardingCompletedAt, activeCoachingWeek, type)
    const submission = findSubmission(checkins, activeCoachingWeek, type)
    if (bypassSchedule && !submission) {
      weekCheckins.push({ ...scheduled, status: 'available' })
    } else {
      weekCheckins.push(resolveTaskStatus(scheduled, submission, referenceDate))
    }
  }

  const todayTasks = weekCheckins.filter(
    (task) =>
      task.status === 'available' ||
      task.status === 'awaiting_review' ||
      task.status === 'missed'
  )

  if (bypassSchedule) {
    return {
      coachingDay,
      calendarCoachingWeek,
      activeCoachingWeek,
      coachingWeek: activeCoachingWeek,
      weekCheckins,
      todayTasks,
      nextCheckin: null,
      nextCheckinStatus: null,
      countdownMs: null,
      countdownLabel: null,
      countdownDetailed: null,
      developmentScheduleMessage: 'Check-ins available immediately.',
    }
  }

  const next = findNextIncompleteCheckin(onboardingCompletedAt, checkins, referenceDate)
  const nextCheckin = next?.scheduled ?? null
  const nextCheckinStatus = next?.status ?? null

  let countdownMs: number | null = null
  if (nextCheckin) {
    if (nextCheckinStatus === 'upcoming') {
      countdownMs = Math.max(0, startOfDay(nextCheckin.dueDate).getTime() - referenceDate.getTime())
    } else if (nextCheckinStatus === 'available' || nextCheckinStatus === 'missed') {
      countdownMs = 0
    }
  }

  return {
    coachingDay,
    calendarCoachingWeek,
    activeCoachingWeek,
    coachingWeek: activeCoachingWeek,
    weekCheckins,
    todayTasks,
    nextCheckin,
    nextCheckinStatus,
    countdownMs,
    countdownLabel: countdownMs != null ? formatCountdown(countdownMs) : null,
    countdownDetailed: countdownMs != null ? formatDetailedCountdown(countdownMs) : null,
    developmentScheduleMessage: null,
  }
}

export function isCheckinAvailableToday(
  onboardingCompletedAt: string | Date,
  type: CheckinType,
  checkins: CheckinRef[],
  referenceDate: Date = new Date(),
  options?: CheckinScheduleOptions
): boolean {
  const activeWeek = getActiveCoachingWeek(checkins, onboardingCompletedAt, referenceDate)
  if (hasSubmission(checkins, activeWeek, type)) return false
  if (type === 'weekly' && !hasSubmission(checkins, activeWeek, 'mid_week')) return false

  const scheduled = buildScheduledCheckin(onboardingCompletedAt, activeWeek, type)
  if (options?.bypassSchedule) return true
  return startOfDay(scheduled.dueDate).getTime() === startOfDay(referenceDate).getTime()
}

/** Resolve which week/type slot a submission should target (production schedule enforced separately). */
export function resolveCheckinSubmissionSlot(
  onboardingCompletedAt: string | Date,
  type: CheckinType,
  checkins: CheckinRef[],
  referenceDate: Date = new Date()
): ScheduledCheckin | null {
  const activeWeek = getActiveCoachingWeek(checkins, onboardingCompletedAt, referenceDate)
  if (hasSubmission(checkins, activeWeek, type)) return null
  if (type === 'weekly' && !hasSubmission(checkins, activeWeek, 'mid_week')) return null
  return buildScheduledCheckin(onboardingCompletedAt, activeWeek, type)
}

export function getCoachClientCheckinSummary(
  clientId: string,
  onboardingCompletedAt: string | Date,
  checkins: Pick<Checkin, 'client_id' | 'checkin_type' | 'coaching_week' | 'coaching_day' | 'id' | 'reviewed'>[],
  referenceDate: Date = new Date()
): CoachClientCheckinSummary {
  const clientCheckins = checkins.filter((c) => c.client_id === clientId)
  const schedule = getClientCheckinSchedule(onboardingCompletedAt, clientCheckins, referenceDate)
  const midWeek = schedule.weekCheckins.find((t) => t.type === 'mid_week')
  const weekly = schedule.weekCheckins.find((t) => t.type === 'weekly')

  return {
    clientId,
    activeCoachingWeek: schedule.activeCoachingWeek,
    nextCheckin: schedule.nextCheckin,
    nextCheckinStatus: schedule.nextCheckinStatus,
    countdownDetailed: schedule.countdownDetailed,
    midWeekStatus: midWeek?.status ?? 'upcoming',
    weeklyStatus: weekly?.status ?? 'upcoming',
  }
}

export type CoachCheckinQueueItem = {
  clientId: string
  clientName: string
  type: CheckinType
  coachingWeek: number
  coachingDay: number
  dueDate: Date
  status: 'pending_review' | 'completed' | 'missed' | 'due_today' | 'upcoming'
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
    const clientName = client.name || client.email || 'Client'
    const clientCheckins = checkins.filter((c) => c.client_id === client.id)
    const activeWeek = getActiveCoachingWeek(clientCheckins, client.onboarding_completed_at, referenceDate)
    const maxWeek = Math.max(activeWeek, getCoachingWeek(getCoachingDay(client.onboarding_completed_at, referenceDate)))

    for (let week = 1; week <= maxWeek; week++) {
      for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
        const scheduled = buildScheduledCheckin(client.onboarding_completed_at, week, type)
        const submission = clientCheckins.find((c) => matchesScheduledSlot(c, week, type))
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
        } else if (week === activeWeek) {
          items.push({
            clientId: client.id,
            clientName,
            type,
            coachingWeek: week,
            coachingDay: scheduled.coachingDay,
            dueDate: scheduled.dueDate,
            status: 'upcoming',
          })
        }
      }
    }
  }

  return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
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
