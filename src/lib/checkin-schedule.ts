import type { Checkin, CheckinType } from '@/types/database'

export const MID_WEEK_DAY = 3
export const WEEKLY_DAY = 7
export const COACHING_WEEK_LENGTH = 7
export const CHECKIN_SUBMISSION_WINDOW_MS = 48 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const INDIA_TIME_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
export const COACHING_TIME_ZONE = 'Asia/Kolkata'

/** The first coaching day begins at midnight IST after initial plan delivery. */
export function getNextCoachingDayStart(deliveredAt: string | Date): Date {
  const delivered = anchorDate(deliveredAt)
  const indiaTime = new Date(delivered.getTime() + INDIA_TIME_OFFSET_MS)
  const nextLocalMidnightAsUtc = Date.UTC(
    indiaTime.getUTCFullYear(),
    indiaTime.getUTCMonth(),
    indiaTime.getUTCDate() + 1
  )
  return new Date(nextLocalMidnightAsUtc - INDIA_TIME_OFFSET_MS)
}

export function hasCoachingDayStarted(
  scheduleStartedAt: string | Date,
  referenceDate: Date = new Date()
): boolean {
  return referenceDate.getTime() >= anchorDate(scheduleStartedAt).getTime()
}

export function getCoachingDateKey(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COACHING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

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
  scheduleAnchored: boolean
  coachingDay: number
  calendarCoachingWeek: number
  activeCoachingWeek: number
  weekCheckins: CheckinTask[]
  todayTasks: CheckinTask[]
  nextCheckin: ScheduledCheckin | null
  nextCheckinStatus: CheckinTaskStatus | null
  countdownMs: number | null
  countdownLabel: string | null
  countdownDetailed: string | null
  /** @deprecated Use activeCoachingWeek. */
  coachingWeek: number
  developmentScheduleMessage: string | null
}

export type CoachClientCheckinSummary = {
  clientId: string
  scheduleAnchored: boolean
  activeCoachingWeek: number
  nextCheckin: ScheduledCheckin | null
  nextCheckinStatus: CheckinTaskStatus | null
  countdownDetailed: string | null
  midWeekStatus: CheckinTaskStatus
  weeklyStatus: CheckinTaskStatus
}

export type CheckinScheduleOptions = {
  /** Development-only: opens anchored current-week slots early. */
  bypassSchedule?: boolean
}

type CheckinRef = Pick<Checkin, 'checkin_type' | 'coaching_week'> &
  Partial<Pick<Checkin, 'coaching_day' | 'id' | 'reviewed'>>

function anchorDate(anchor: string | Date): Date {
  const date = new Date(anchor)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid check-in schedule anchor')
  return date
}

export function getCheckinWindowEnd(dueDate: Date): Date {
  return new Date(dueDate.getTime() + CHECKIN_SUBMISSION_WINDOW_MS)
}

export function isWithinCheckinSubmissionWindow(
  dueDate: Date,
  referenceDate: Date = new Date()
): boolean {
  const now = referenceDate.getTime()
  return now >= dueDate.getTime() && now < getCheckinWindowEnd(dueDate).getTime()
}

export function isCheckinSubmissionWindowClosed(
  dueDate: Date,
  referenceDate: Date = new Date()
): boolean {
  return referenceDate.getTime() >= getCheckinWindowEnd(dueDate).getTime()
}

/** Elapsed 24-hour coaching periods, 1-indexed from first plan delivery. */
export function getCoachingDay(scheduleStartedAt: string | Date, referenceDate: Date = new Date()): number {
  const elapsed = referenceDate.getTime() - anchorDate(scheduleStartedAt).getTime()
  return Math.max(1, Math.floor(elapsed / DAY_MS) + 1)
}

export function getCoachingWeek(coachingDay: number): number {
  return Math.max(1, Math.ceil(coachingDay / COACHING_WEEK_LENGTH))
}

export function getCoachingDayInWeek(coachingDay: number): number {
  const mod = coachingDay % COACHING_WEEK_LENGTH
  return mod === 0 ? COACHING_WEEK_LENGTH : mod
}

export function getAbsoluteCoachingDay(coachingWeek: number, dayInWeek: number): number {
  return (coachingWeek - 1) * COACHING_WEEK_LENGTH + dayInWeek
}

/** Day 3 is anchor +48h; Day 7 is anchor +144h; later weeks recur every 168h. */
export function getDueDate(
  scheduleStartedAt: string | Date,
  coachingWeek: number,
  dayInWeek: number
): Date {
  const absoluteDay = getAbsoluteCoachingDay(coachingWeek, dayInWeek)
  return new Date(anchorDate(scheduleStartedAt).getTime() + (absoluteDay - 1) * DAY_MS)
}

export function buildScheduledCheckin(
  scheduleStartedAt: string | Date,
  coachingWeek: number,
  type: CheckinType
): ScheduledCheckin {
  const dayInWeek = type === 'mid_week' ? MID_WEEK_DAY : WEEKLY_DAY
  return {
    type,
    coachingWeek,
    coachingDay: getAbsoluteCoachingDay(coachingWeek, dayInWeek),
    dueDate: getDueDate(scheduleStartedAt, coachingWeek, dayInWeek),
    label: type === 'mid_week'
      ? `Mid-Week Check-in (Week ${coachingWeek})`
      : `Weekly Check-in (Week ${coachingWeek})`,
    href: type === 'mid_week' ? '/checkin/mid-week' : '/checkin',
  }
}

function inferCoachingWeekFromCheckin(checkin: CheckinRef): number | null {
  if (checkin.coaching_week != null) return checkin.coaching_week
  if (checkin.coaching_day != null) return getCoachingWeek(checkin.coaching_day)
  return null
}

function matchesScheduledSlot(checkin: CheckinRef, week: number, type: CheckinType): boolean {
  if (checkin.checkin_type !== type) return false
  if (checkin.coaching_week === week || inferCoachingWeekFromCheckin(checkin) === week) return true
  return checkin.coaching_day === getAbsoluteCoachingDay(week, type === 'mid_week' ? MID_WEEK_DAY : WEEKLY_DAY)
}

function findSubmission(checkins: CheckinRef[], week: number, type: CheckinType) {
  const match = checkins.find((checkin) => matchesScheduledSlot(checkin, week, type))
  return match?.id ? { id: match.id, reviewed: match.reviewed ?? false } : undefined
}

function hasSubmission(checkins: CheckinRef[], week: number, type: CheckinType): boolean {
  return checkins.some((checkin) => matchesScheduledSlot(checkin, week, type))
}

function isSkippedMissedSlot(
  scheduleStartedAt: string | Date,
  checkins: CheckinRef[],
  week: number,
  type: CheckinType,
  referenceDate: Date
): boolean {
  return !hasSubmission(checkins, week, type) &&
    isCheckinSubmissionWindowClosed(buildScheduledCheckin(scheduleStartedAt, week, type).dueDate, referenceDate)
}

export function getActiveCoachingWeek(
  checkins: CheckinRef[],
  scheduleStartedAt?: string | Date | null,
  referenceDate: Date = new Date()
): number {
  if (!scheduleStartedAt) return 1
  for (let week = 1; week <= 520; week++) {
    for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
      if (hasSubmission(checkins, week, type)) continue
      if (isSkippedMissedSlot(scheduleStartedAt, checkins, week, type, referenceDate)) continue
      return week
    }
  }
  return getCoachingWeek(getCoachingDay(scheduleStartedAt, referenceDate))
}

function resolveTaskStatus(
  scheduled: ScheduledCheckin,
  submission: { id: string; reviewed: boolean } | undefined,
  referenceDate: Date
): CheckinTask {
  if (submission) {
    return {
      ...scheduled,
      status: submission.reviewed ? 'completed' : 'awaiting_review',
      checkinId: submission.id,
      reviewed: submission.reviewed,
    }
  }
  if (isWithinCheckinSubmissionWindow(scheduled.dueDate, referenceDate)) {
    return { ...scheduled, status: 'available' }
  }
  if (isCheckinSubmissionWindowClosed(scheduled.dueDate, referenceDate)) {
    return { ...scheduled, status: 'missed' }
  }
  return { ...scheduled, status: 'upcoming' }
}

function findNextIncompleteCheckin(
  scheduleStartedAt: string | Date,
  checkins: CheckinRef[],
  referenceDate: Date
): { scheduled: ScheduledCheckin; status: CheckinTaskStatus } | null {
  for (let week = 1; week <= 520; week++) {
    for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
      if (hasSubmission(checkins, week, type)) continue
      if (isSkippedMissedSlot(scheduleStartedAt, checkins, week, type, referenceDate)) continue
      const scheduled = buildScheduledCheckin(scheduleStartedAt, week, type)
      return { scheduled, status: resolveTaskStatus(scheduled, undefined, referenceDate).status }
    }
  }
  return null
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Due now'
  const days = Math.ceil(ms / DAY_MS)
  return days === 1 ? '1 day' : `${days} days`
}

export function formatDetailedCountdown(ms: number): string {
  if (ms <= 0) return 'Available now'
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes || !parts.length) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  return parts.join(' ')
}

export function getCheckinStatusLabel(status: CheckinTaskStatus): string {
  return {
    completed: 'Completed',
    upcoming: 'Upcoming',
    available: 'Available',
    missed: 'Missed',
    awaiting_review: 'Awaiting Review',
  }[status]
}

export function getCheckinTypeDisplayName(type: CheckinType): string {
  return type === 'mid_week' ? 'Mid-Week Check-in' : 'Weekly Check-in'
}

export function getClientCheckinSchedule(
  scheduleStartedAt: string | Date | null | undefined,
  checkins: CheckinRef[],
  referenceDate: Date = new Date(),
  options?: CheckinScheduleOptions
): ClientCheckinSchedule {
  if (!scheduleStartedAt) {
    return {
      scheduleAnchored: false,
      coachingDay: 0,
      calendarCoachingWeek: 0,
      activeCoachingWeek: 1,
      coachingWeek: 1,
      weekCheckins: [],
      todayTasks: [],
      nextCheckin: null,
      nextCheckinStatus: null,
      countdownMs: null,
      countdownLabel: null,
      countdownDetailed: null,
      developmentScheduleMessage: null,
    }
  }

  const coachingDay = getCoachingDay(scheduleStartedAt, referenceDate)
  const activeCoachingWeek = getActiveCoachingWeek(checkins, scheduleStartedAt, referenceDate)
  const weekCheckins = (['mid_week', 'weekly'] as CheckinType[]).map((type) => {
    const scheduled = buildScheduledCheckin(scheduleStartedAt, activeCoachingWeek, type)
    const submission = findSubmission(checkins, activeCoachingWeek, type)
    return options?.bypassSchedule && !submission
      ? { ...scheduled, status: 'available' as const }
      : resolveTaskStatus(scheduled, submission, referenceDate)
  })
  const todayTasks = weekCheckins.filter((task) =>
    task.status === 'available' || task.status === 'awaiting_review'
  )

  if (options?.bypassSchedule) {
    return {
      scheduleAnchored: true,
      coachingDay,
      calendarCoachingWeek: getCoachingWeek(coachingDay),
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

  const next = findNextIncompleteCheckin(scheduleStartedAt, checkins, referenceDate)
  const countdownMs = next
    ? next.status === 'upcoming'
      ? Math.max(0, next.scheduled.dueDate.getTime() - referenceDate.getTime())
      : next.status === 'available' ? 0 : null
    : null

  return {
    scheduleAnchored: true,
    coachingDay,
    calendarCoachingWeek: getCoachingWeek(coachingDay),
    activeCoachingWeek,
    coachingWeek: activeCoachingWeek,
    weekCheckins,
    todayTasks,
    nextCheckin: next?.scheduled ?? null,
    nextCheckinStatus: next?.status ?? null,
    countdownMs,
    countdownLabel: countdownMs != null ? formatCountdown(countdownMs) : null,
    countdownDetailed: countdownMs != null ? formatDetailedCountdown(countdownMs) : null,
    developmentScheduleMessage: null,
  }
}

function requiresOpenMidWeekFirst(
  scheduleStartedAt: string | Date,
  checkins: CheckinRef[],
  week: number,
  type: CheckinType,
  referenceDate: Date
): boolean {
  return type === 'weekly' &&
    !hasSubmission(checkins, week, 'mid_week') &&
    !isSkippedMissedSlot(scheduleStartedAt, checkins, week, 'mid_week', referenceDate)
}

export function isCheckinAvailableToday(
  scheduleStartedAt: string | Date | null | undefined,
  type: CheckinType,
  checkins: CheckinRef[],
  referenceDate: Date = new Date(),
  options?: CheckinScheduleOptions
): boolean {
  if (!scheduleStartedAt) return false
  const week = getActiveCoachingWeek(checkins, scheduleStartedAt, referenceDate)
  if (hasSubmission(checkins, week, type)) return false
  if (requiresOpenMidWeekFirst(scheduleStartedAt, checkins, week, type, referenceDate)) return false
  const scheduled = buildScheduledCheckin(scheduleStartedAt, week, type)
  return options?.bypassSchedule === true ||
    isWithinCheckinSubmissionWindow(scheduled.dueDate, referenceDate)
}

export type CheckinUnavailableReason =
  | 'plan_not_delivered'
  | 'already_submitted'
  | 'waiting_mid_week'
  | 'not_yet'
  | 'window_closed'

export function getCheckinUnavailableReason(
  scheduleStartedAt: string | Date | null | undefined,
  type: CheckinType,
  checkins: CheckinRef[],
  referenceDate: Date = new Date()
): CheckinUnavailableReason | null {
  if (!scheduleStartedAt) return 'plan_not_delivered'
  const week = getActiveCoachingWeek(checkins, scheduleStartedAt, referenceDate)
  if (hasSubmission(checkins, week, type)) return 'already_submitted'
  if (requiresOpenMidWeekFirst(scheduleStartedAt, checkins, week, type, referenceDate)) return 'waiting_mid_week'
  const scheduled = buildScheduledCheckin(scheduleStartedAt, week, type)
  if (isWithinCheckinSubmissionWindow(scheduled.dueDate, referenceDate)) return null
  return isCheckinSubmissionWindowClosed(scheduled.dueDate, referenceDate) ? 'window_closed' : 'not_yet'
}

export function resolveCheckinSubmissionSlot(
  scheduleStartedAt: string | Date | null | undefined,
  type: CheckinType,
  checkins: CheckinRef[],
  referenceDate: Date = new Date()
): ScheduledCheckin | null {
  if (!scheduleStartedAt) return null
  const week = getActiveCoachingWeek(checkins, scheduleStartedAt, referenceDate)
  if (hasSubmission(checkins, week, type)) return null
  if (requiresOpenMidWeekFirst(scheduleStartedAt, checkins, week, type, referenceDate)) return null
  return buildScheduledCheckin(scheduleStartedAt, week, type)
}

export function getCoachClientCheckinSummary(
  clientId: string,
  scheduleStartedAt: string | Date | null | undefined,
  checkins: Pick<Checkin, 'client_id' | 'checkin_type' | 'coaching_week' | 'coaching_day' | 'id' | 'reviewed'>[],
  referenceDate: Date = new Date()
): CoachClientCheckinSummary {
  const schedule = getClientCheckinSchedule(
    scheduleStartedAt,
    checkins.filter((checkin) => checkin.client_id === clientId),
    referenceDate
  )
  return {
    clientId,
    scheduleAnchored: schedule.scheduleAnchored,
    activeCoachingWeek: schedule.activeCoachingWeek,
    nextCheckin: schedule.nextCheckin,
    nextCheckinStatus: schedule.nextCheckinStatus,
    countdownDetailed: schedule.countdownDetailed,
    midWeekStatus: schedule.weekCheckins.find((task) => task.type === 'mid_week')?.status ?? 'upcoming',
    weeklyStatus: schedule.weekCheckins.find((task) => task.type === 'weekly')?.status ?? 'upcoming',
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

export function getCoachCheckinQueue(
  clients: {
    id: string
    name: string | null
    email: string | null
    checkin_schedule_started_at: string | null
  }[],
  checkins: Pick<Checkin, 'id' | 'client_id' | 'checkin_type' | 'coaching_week' | 'coaching_day' | 'reviewed' | 'submitted_at' | 'due_at'>[],
  referenceDate: Date = new Date()
): CoachCheckinQueueItem[] {
  const items: CoachCheckinQueueItem[] = []
  for (const client of clients) {
    if (!client.checkin_schedule_started_at) continue
    const clientCheckins = checkins.filter((checkin) => checkin.client_id === client.id)
    const activeWeek = getActiveCoachingWeek(clientCheckins, client.checkin_schedule_started_at, referenceDate)
    const maxWeek = Math.max(
      activeWeek,
      getCoachingWeek(getCoachingDay(client.checkin_schedule_started_at, referenceDate))
    )
    for (let week = 1; week <= maxWeek; week++) {
      for (const type of ['mid_week', 'weekly'] as CheckinType[]) {
        const scheduled = buildScheduledCheckin(client.checkin_schedule_started_at, week, type)
        const submission = clientCheckins.find((checkin) => matchesScheduledSlot(checkin, week, type))
        const dueDate = submission?.due_at ? new Date(submission.due_at) : scheduled.dueDate
        const common = {
          clientId: client.id,
          clientName: client.name || client.email || 'Client',
          type,
          coachingWeek: week,
          coachingDay: scheduled.coachingDay,
          dueDate,
        }
        if (submission) {
          items.push({
            ...common,
            status: submission.reviewed ? 'completed' : 'pending_review',
            checkinId: submission.id,
            submittedAt: submission.submitted_at,
          })
        } else if (isWithinCheckinSubmissionWindow(dueDate, referenceDate)) {
          items.push({ ...common, status: 'due_today' })
        } else if (isCheckinSubmissionWindowClosed(dueDate, referenceDate)) {
          items.push({ ...common, status: 'missed' })
        } else if (week === activeWeek) {
          items.push({ ...common, status: 'upcoming' })
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
