import 'server-only'
import { coachingWeekLogDates } from '@/lib/checkin-schedule'
import {
  buildWeeklyWorkbook,
  weeklyWorkbookFilename,
} from '@/lib/client-reports/weekly-workbook'
import { sendDirectEmail } from '@/lib/notifications/email-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin } from '@/types/database'
import type {
  DailyTrackerDay,
  TrackerCategoryScores,
  TrackerCompletion,
  TrackerSnapshot,
} from '@/lib/daily-tracker/types'

export type WeeklyWorkbookDelivery = {
  filename: string
  buffer: Buffer
  emailed: boolean
  skippedReason?: string
}

function rowToTrackerDay(row: Record<string, unknown>): DailyTrackerDay {
  return {
    id: String(row.id ?? ''),
    client_id: String(row.client_id ?? ''),
    log_date: String(row.log_date ?? ''),
    plan_id: (row.plan_id as string | null) ?? null,
    plan_version: Number(row.plan_version ?? 0),
    coaching_day: (row.coaching_day as number | null) ?? null,
    coaching_week: (row.coaching_week as number | null) ?? null,
    snapshot: (row.snapshot as TrackerSnapshot) ?? { items: [], generatedAt: '', planId: '', planVersion: 0, planTitle: '' },
    completion: (row.completion as TrackerCompletion) ?? {},
    scores: (row.scores as TrackerCategoryScores | null) ?? null,
    overall_percent: (row.overall_percent as number | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function buildWeeklyCheckinWorkbook(input: {
  clientId: string
  checkinId: string
}): Promise<{ filename: string; buffer: Buffer } | { error: string }> {
  const admin = createAdminClient()
  const [{ data: checkin }, { data: profile }] = await Promise.all([
    admin.from('checkins').select('*').eq('id', input.checkinId).eq('client_id', input.clientId).maybeSingle(),
    admin
      .from('profiles')
      .select('id, name, email, checkin_schedule_started_at')
      .eq('id', input.clientId)
      .maybeSingle(),
  ])

  if (!checkin || checkin.checkin_type !== 'weekly') {
    return { error: 'Weekly check-in not found.' }
  }
  if (!profile?.checkin_schedule_started_at) {
    return { error: 'Check-in schedule is not available yet.' }
  }

  const coachingWeek = checkin.coaching_week ?? 1
  const weekDates = coachingWeekLogDates(profile.checkin_schedule_started_at, coachingWeek)
  const start = weekDates[0]
  const end = weekDates[weekDates.length - 1]

  const [{ data: previous }, { data: trackerRows }] = await Promise.all([
    coachingWeek > 1
      ? admin
          .from('checkins')
          .select('*')
          .eq('client_id', input.clientId)
          .eq('checkin_type', 'weekly')
          .eq('coaching_week', coachingWeek - 1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    start && end
      ? admin
          .from('daily_tracker_days')
          .select('*')
          .eq('client_id', input.clientId)
          .gte('log_date', start)
          .lte('log_date', end)
          .order('log_date', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const clientName = profile.name?.trim() || profile.email || 'Client'
  const buffer = buildWeeklyWorkbook({
    clientName,
    clientEmail: profile.email ?? '',
    coachingWeek,
    checkin: checkin as Checkin,
    previousCheckin: (previous as Checkin | null) ?? null,
    trackerDays: (trackerRows ?? []).map((row) => rowToTrackerDay(row as Record<string, unknown>)),
    weekDates,
  })

  return { filename: weeklyWorkbookFilename(clientName, coachingWeek), buffer }
}

export async function deliverWeeklyCheckinWorkbook(input: {
  clientId: string
  checkinId: string
}): Promise<WeeklyWorkbookDelivery | { error: string }> {
  const built = await buildWeeklyCheckinWorkbook(input)
  if ('error' in built) return built

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('name, email')
    .eq('id', input.clientId)
    .maybeSingle()

  const to = profile?.email?.trim()
  if (!to) {
    return { ...built, emailed: false, skippedReason: 'Client has no email' }
  }

  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'there'
  const result = await sendDirectEmail({
    to,
    subject: `Your Lurvox week report — ${built.filename.replace(/\.xlsx$/i, '')}`,
    text: [
      `Hi ${firstName},`,
      '',
      'Your weekly check-in is in. Attached is this week’s Excel report:',
      '• Weekly check-in — measurements and scores vs last week',
      '• Daily tracker — what you logged each day',
      '• Workout sets — reps and weight',
      '',
      'Days you did not open the tracker stay blank.',
      '',
      'You can also download this file again from Weekly Check-in.',
      '',
      '— Lurvox',
    ].join('\n'),
    attachments: [{ filename: built.filename, content: built.buffer }],
  })

  if (!result.ok) {
    console.error('[weekly-workbook] email failed:', result.error)
    return { ...built, emailed: false, skippedReason: result.error }
  }
  if (result.skipped) {
    return { ...built, emailed: false, skippedReason: 'Email is not configured' }
  }
  return { ...built, emailed: true }
}
