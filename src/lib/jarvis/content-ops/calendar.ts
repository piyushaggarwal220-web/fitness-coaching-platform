/**
 * Content calendar — day / week / month views in business timezone.
 */

import { BUSINESS_TIMEZONE, zonedLocalToUtc, zonedYmd } from '@/lib/time/business-calendar'
import { canSchedule } from '@/lib/jarvis/content-ops/state-machine'
import {
  getContentOpsById,
  resolveOpsState,
  transitionContentOps,
} from '@/lib/jarvis/content-ops/store'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentOpsState } from '@/lib/jarvis/content-ops/types'

export type CalendarViewMode = 'day' | 'week' | 'month'

export type CalendarItem = {
  content_id: string
  title: string
  format: string
  objective: string | null
  pillar: string | null
  scheduled_at: string
  scheduled_local: string
  status: ContentOpsState
  timezone: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function parseLocalDateTime(
  dateYmd: string,
  timeHm: string,
  timezone: string = BUSINESS_TIMEZONE
): Date {
  const [y, mo, d] = dateYmd.split('-').map(Number)
  const [hh, mm] = timeHm.split(':').map(Number)
  return zonedLocalToUtc(timezone, y, mo, d, hh || 0, mm || 0, 0)
}

export async function listCalendarItems(input: {
  mode: CalendarViewMode
  anchorYmd: string
  timezone?: string
}): Promise<CalendarItem[]> {
  const tz = input.timezone ?? BUSINESS_TIMEZONE
  const [y, mo, d] = input.anchorYmd.split('-').map(Number)
  let start: Date
  let end: Date

  if (input.mode === 'day') {
    start = zonedLocalToUtc(tz, y, mo, d, 0, 0, 0)
    end = zonedLocalToUtc(tz, y, mo, d + 1, 0, 0, 0)
  } else if (input.mode === 'week') {
    const anchor = zonedLocalToUtc(tz, y, mo, d, 12, 0, 0)
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(anchor)
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const offset = map[wd] ?? 0
    start = zonedLocalToUtc(tz, y, mo, d - offset, 0, 0, 0)
    end = new Date(start.getTime() + 7 * 86400000)
  } else {
    start = zonedLocalToUtc(tz, y, mo, 1, 0, 0, 0)
    end = zonedLocalToUtc(tz, y, mo + 1, 1, 0, 0, 0)
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('marketing_content')
    .select(
      'id, topic, content_type, reason, content_category, content_mix_pillar, scheduled_for, ops_state, status'
    )
    .eq('platform', 'instagram')
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', start.toISOString())
    .lt('scheduled_for', end.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(200)

  return (data ?? []).map((row) => {
    const scheduled = String(row.scheduled_for)
    const localYmd = zonedYmd(new Date(scheduled), tz)
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(scheduled))
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '12'
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
    return {
      content_id: row.id as string,
      title: (row.topic as string) || 'Untitled',
      format: (row.content_type as string) || 'reel',
      objective: (row.reason as string) || null,
      pillar: (row.content_mix_pillar as string) || (row.content_category as string) || null,
      scheduled_at: scheduled,
      scheduled_local: `${localYmd} ${hh}:${mm}`,
      status: resolveOpsState(row as { ops_state?: string; status?: string }),
      timezone: tz,
    }
  })
}

export async function scheduleContent(input: {
  contentId: string
  dateYmd: string
  timeHm?: string
  timezone?: string
  actorId?: string | null
  reason?: string
}): Promise<{ ok: boolean; scheduled_at?: string; error?: string; code?: string }> {
  const row = await getContentOpsById(input.contentId)
  if (!row) return { ok: false, error: 'content_not_found', code: 'NOT_FOUND' }

  const state = resolveOpsState(row)
  if (!canSchedule(state)) {
    return {
      ok: false,
      error: `Cannot schedule from state ${state} — approval required first`,
      code: 'NOT_APPROVED',
    }
  }

  const tz = input.timezone ?? BUSINESS_TIMEZONE
  const timeHm = input.timeHm ?? '19:30'
  const at = parseLocalDateTime(input.dateYmd, timeHm, tz)
  const scheduledAt = at.toISOString()

  const admin = createAdminClient()
  await admin.from('jarvis_creative_calendar').upsert(
    {
      content_id: input.contentId,
      planned_date: input.dateYmd,
      planned_time: `${timeHm}:00`,
      scheduled_at: scheduledAt,
      timezone: tz,
      pillar: row.content_mix_pillar ?? row.content_category,
      objective: row.reason,
      format: row.content_type,
      status: 'scheduled',
      created_by: input.actorId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'content_id,planned_date' }
  )

  const toState: ContentOpsState = 'SCHEDULED'
  const tr = await transitionContentOps({
    contentId: input.contentId,
    to: toState,
    reason: input.reason ?? 'scheduled',
    actor: input.actorId ?? 'jarvis',
    patch: { scheduled_for: scheduledAt },
  })
  if (!tr.ok) return { ok: false, error: tr.error, code: 'TRANSITION_FAILED' }

  return { ok: true, scheduled_at: scheduledAt }
}

export async function rescheduleContent(input: {
  contentId: string
  dateYmd: string
  timeHm?: string
  timezone?: string
  actorId?: string | null
}): Promise<{ ok: boolean; scheduled_at?: string; error?: string; code?: string }> {
  return scheduleContent({ ...input, reason: 'rescheduled' })
}

export async function unscheduleContent(input: {
  contentId: string
  actorId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const row = await getContentOpsById(input.contentId)
  if (!row) return { ok: false, error: 'content_not_found' }
  const state = resolveOpsState(row)
  if (state !== 'SCHEDULED' && state !== 'APPROVED') {
    return { ok: false, error: `Cannot unschedule from ${state}` }
  }

  const admin = createAdminClient()
  await admin
    .from('marketing_content')
    .update({ scheduled_for: null, updated_at: new Date().toISOString() })
    .eq('id', input.contentId)

  if (state === 'SCHEDULED') {
    await transitionContentOps({
      contentId: input.contentId,
      to: 'APPROVED',
      reason: 'unscheduled',
      actor: input.actorId ?? 'jarvis',
      patch: { scheduled_for: null },
    })
  }
  return { ok: true }
}

export async function cancelScheduledContent(input: {
  contentId: string
  actorId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const row = await getContentOpsById(input.contentId)
  if (!row) return { ok: false, error: 'content_not_found' }
  const state = resolveOpsState(row)
  if (state !== 'SCHEDULED' && state !== 'APPROVED' && state !== 'PUBLISHING') {
    return { ok: false, error: `Cannot cancel from ${state}` }
  }
  return transitionContentOps({
    contentId: input.contentId,
    to: 'CANCELLED',
    reason: 'cancelled_by_user',
    actor: input.actorId ?? 'jarvis',
    patch: { scheduled_for: null },
  })
}

/** Resolve natural-language-ish relative dates in business TZ (deterministic helpers). */
export function resolveRelativeSchedule(
  phrase: string,
  now: Date = new Date(),
  timezone: string = BUSINESS_TIMEZONE
): { dateYmd: string; timeHm: string } | null {
  const p = phrase.toLowerCase().trim()
  const today = zonedYmd(now, timezone)
  const [y, mo, d] = today.split('-').map(Number)

  const timeMatch = p.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  let hh = 19
  let mm = 30
  if (timeMatch) {
    hh = Number(timeMatch[1])
    mm = timeMatch[2] ? Number(timeMatch[2]) : 0
    const ap = timeMatch[3]
    if (ap === 'pm' && hh < 12) hh += 12
    if (ap === 'am' && hh === 12) hh = 0
  }

  let target = zonedLocalToUtc(timezone, y, mo, d, 12, 0, 0)
  if (p.includes('tomorrow')) {
    target = new Date(target.getTime() + 86400000)
  } else if (p.includes('next week')) {
    target = new Date(target.getTime() + 7 * 86400000)
  } else if (/\bfriday\b/.test(p)) {
    for (let i = 1; i <= 7; i++) {
      const probe = new Date(target.getTime() + i * 86400000)
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
        probe
      )
      if (wd === 'Fri') {
        target = probe
        break
      }
    }
  } else if (!p.includes('today') && !timeMatch) {
    return null
  }

  return {
    dateYmd: zonedYmd(target, timezone),
    timeHm: `${pad(hh)}:${pad(mm)}`,
  }
}
