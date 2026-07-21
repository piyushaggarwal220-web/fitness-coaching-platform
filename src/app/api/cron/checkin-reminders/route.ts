import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasClientEntitlement } from '@/lib/entitlements'
import { getClientCheckinSchedule } from '@/lib/checkin-schedule'
import { sendNotification, NotificationTemplates } from '@/lib/notifications/service'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import type { Checkin, NotificationType } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Vercel cron: 30 2 * * * (02:30 UTC = 08:00 IST). */

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    // Fail closed in production; allow local/dev without secret for smoke tests.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      return false
    }
    return true
  }

  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true

  const url = new URL(request.url)
  if (url.searchParams.get('secret') === secret) return true

  return false
}

/** Start/end of the current calendar day in Asia/Kolkata, as UTC ISO strings. */
function getIstDayBoundsUtc(now = new Date()): { startIso: string; endIso: string } {
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = Number(istParts.find((p) => p.type === 'year')?.value)
  const month = Number(istParts.find((p) => p.type === 'month')?.value)
  const day = Number(istParts.find((p) => p.type === 'day')?.value)

  // IST = UTC+05:30 → midnight IST = 18:30 previous UTC day
  const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000

  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  }
}

type EligibleClient = {
  id: string
  name: string | null
  phone: string | null
  checkin_schedule_started_at: string
  payment_confirmed: boolean | null
  access_source: 'purchase' | 'admin_trial' | null
  subscription_expires_at: string | null
}

async function alreadySentToday(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  type: NotificationType,
  startIso: string,
  endIso: string
): Promise<boolean> {
  const { count } = await admin
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
    .gte('created_at', startIso)
    .lt('created_at', endIso)

  return (count ?? 0) > 0
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const { startIso, endIso } = getIstDayBoundsUtc(now)

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select(
      'id, name, phone, checkin_schedule_started_at, payment_confirmed, access_source, subscription_expires_at'
    )
    .eq('role', 'client')
    .not('checkin_schedule_started_at', 'is', null)
    .not('phone', 'is', null)

  if (profilesError) {
    console.error('[cron/checkin-reminders] profiles query failed:', profilesError.message)
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  const clients = ((profiles ?? []) as EligibleClient[]).filter((p) => {
    if (!p.checkin_schedule_started_at) return false
    if (!normalizePhoneForWhatsApp(p.phone)) return false
    return hasClientEntitlement(p)
  })

  const clientIds = clients.map((c) => c.id)
  let checkinsByClient = new Map<string, Pick<Checkin, 'checkin_type' | 'coaching_week' | 'coaching_day' | 'id' | 'reviewed'>[]>()

  if (clientIds.length > 0) {
    const { data: checkins, error: checkinsError } = await admin
      .from('checkins')
      .select('id, client_id, checkin_type, coaching_week, coaching_day, reviewed')
      .in('client_id', clientIds)

    if (checkinsError) {
      console.error('[cron/checkin-reminders] checkins query failed:', checkinsError.message)
      return NextResponse.json({ error: checkinsError.message }, { status: 500 })
    }

    checkinsByClient = new Map()
    for (const row of checkins ?? []) {
      const c = row as Pick<Checkin, 'id' | 'client_id' | 'checkin_type' | 'coaching_week' | 'coaching_day' | 'reviewed'>
      const list = checkinsByClient.get(c.client_id) ?? []
      list.push(c)
      checkinsByClient.set(c.client_id, list)
    }
  }

  let sent = 0
  let skipped = 0
  const details: { userId: string; type: NotificationType; result: 'sent' | 'skipped' | 'failed'; reason?: string }[] = []

  for (const client of clients) {
    const schedule = getClientCheckinSchedule(
      client.checkin_schedule_started_at,
      checkinsByClient.get(client.id) ?? [],
      now
    )

    const dueTasks = schedule.weekCheckins.filter((t) => t.status === 'available')

    if (dueTasks.length === 0) {
      skipped += 1
      continue
    }

    for (const task of dueTasks) {
      const type: NotificationType =
        task.type === 'mid_week' ? 'mid_week_checkin_reminder' : 'weekly_checkin_reminder'

      if (await alreadySentToday(admin, client.id, type, startIso, endIso)) {
        skipped += 1
        details.push({ userId: client.id, type, result: 'skipped', reason: 'already_sent_today' })
        continue
      }

      const template =
        task.type === 'mid_week'
          ? NotificationTemplates.midWeekCheckinReminder({
              checkinLabel: task.label,
              coachingWeek: task.coachingWeek,
            })
          : NotificationTemplates.weeklyCheckinReminder({
              checkinLabel: task.label,
              coachingWeek: task.coachingWeek,
            })

      const notification = await sendNotification({
        userId: client.id,
        ...template,
        metadata: {
          ...template.metadata,
          firstName: client.name?.trim()?.split(/\s+/)[0] ?? undefined,
        },
      })

      if (notification) {
        sent += 1
        details.push({ userId: client.id, type, result: 'sent' })
      } else {
        skipped += 1
        details.push({ userId: client.id, type, result: 'failed', reason: 'insert_failed' })
      }
    }
  }

  const summary = {
    checked: clients.length,
    sent,
    skipped,
  }

  console.log('[cron/checkin-reminders]', summary)
  return NextResponse.json({ ...summary, details })
}

/** Allow POST for manual triggers with the same auth. */
export async function POST(request: Request) {
  return GET(request)
}
