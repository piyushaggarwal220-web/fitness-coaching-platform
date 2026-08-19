import { COACHING_TIME_ZONE, getCoachingDateKey } from '@/lib/checkin-schedule'
import { isInMembershipGrace } from '@/lib/entitlements'
import { getCoachingPlan } from '@/lib/payments/plans'
import { createAdminClient } from '@/lib/supabase/admin'

export type PlanEndingSeatStatus = 'ending' | 'grace' | 'ended'

export type PlanEndingClient = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  planName: string
  accessSource: string | null
  expiresAt: string
  coachName: string | null
  seatStatus: PlanEndingSeatStatus
}

export type PlanEndingDay = {
  date: string
  label: string
  count: number
  clients: PlanEndingClient[]
}

export type PlanEndingsSummary = {
  timezone: string
  today: string
  endingToday: number
  endingNext7Days: number
  endingNext30Days: number
  upcomingTotal: number
  alreadyEnded: number
}

export type PlanEndingsPayload = {
  summary: PlanEndingsSummary
  upcoming: PlanEndingDay[]
  ended: PlanEndingDay[]
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utc = Date.UTC(year, month - 1, day + days)
  return getCoachingDateKey(new Date(utc))
}

function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function planDisplayName(planSlug: string | null | undefined, planName: string | null | undefined): string {
  return getCoachingPlan(planSlug)?.name || planName || planSlug || 'Coaching plan'
}

export async function getPlanEndings(): Promise<PlanEndingsPayload> {
  const admin = createAdminClient()
  const now = new Date()
  const today = getCoachingDateKey(now)
  const in7 = addDays(today, 7)
  const in30 = addDays(today, 30)

  const [{ data: profiles, error: profileError }, { data: purchases }, { data: coaches }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, name, email, phone, payment_confirmed, access_source, subscription_expires_at, coach_id')
      .eq('role', 'client')
      .not('subscription_expires_at', 'is', null),
    admin
      .from('purchases')
      .select('user_id, plan_slug, plan_name, customer_phone, created_at, status')
      .eq('status', 'captured')
      .order('created_at', { ascending: false }),
    admin.from('coaches').select('id, name'),
  ])

  if (profileError) {
    throw new Error(profileError.message)
  }

  const latestPurchaseByUser = new Map<
    string,
    { plan_slug: string | null; plan_name: string | null; customer_phone: string | null }
  >()
  for (const row of purchases ?? []) {
    const userId = row.user_id as string | null
    if (!userId || latestPurchaseByUser.has(userId)) continue
    latestPurchaseByUser.set(userId, {
      plan_slug: (row.plan_slug as string | null) ?? null,
      plan_name: (row.plan_name as string | null) ?? null,
      customer_phone: (row.customer_phone as string | null) ?? null,
    })
  }

  const coachNameById = new Map<string, string>()
  for (const coach of coaches ?? []) {
    coachNameById.set(coach.id as string, (coach.name as string | null) || 'Coach')
  }

  const upcomingMap = new Map<string, PlanEndingClient[]>()
  const endedMap = new Map<string, PlanEndingClient[]>()

  for (const profile of profiles ?? []) {
    if (profile.access_source === 'admin_trial') continue
    const expiresAt = profile.subscription_expires_at as string
    if (!expiresAt) continue
    const date = getCoachingDateKey(new Date(expiresAt))
    const purchase = latestPurchaseByUser.get(profile.id as string)
    const paymentConfirmed = profile.payment_confirmed === true
    const upcoming = date >= today && paymentConfirmed
    const seatStatus: PlanEndingSeatStatus = upcoming
      ? 'ending'
      : isInMembershipGrace({
          payment_confirmed: paymentConfirmed,
          access_source: (profile.access_source as 'purchase' | 'admin_trial' | 'enrollment_code' | null) ?? null,
          subscription_expires_at: expiresAt,
        })
        ? 'grace'
        : 'ended'
    const client: PlanEndingClient = {
      id: profile.id as string,
      name: (profile.name as string | null) ?? null,
      email: (profile.email as string | null) ?? null,
      phone:
        (profile.phone as string | null)?.trim() ||
        purchase?.customer_phone?.trim() ||
        null,
      planName: planDisplayName(purchase?.plan_slug, purchase?.plan_name),
      accessSource: (profile.access_source as string | null) ?? null,
      expiresAt,
      coachName: profile.coach_id ? coachNameById.get(profile.coach_id as string) ?? null : null,
      seatStatus,
    }
    const bucket = upcoming ? upcomingMap : endedMap
    const bucketDate = upcoming ? date : date < today ? date : today
    const list = bucket.get(bucketDate) ?? []
    list.push(client)
    bucket.set(bucketDate, list)
  }

  const toDays = (map: Map<string, PlanEndingClient[]>, ascending: boolean): PlanEndingDay[] =>
    Array.from(map.entries())
      .sort(([a], [b]) => (ascending ? a.localeCompare(b) : b.localeCompare(a)))
      .map(([date, clients]) => ({
        date,
        label: formatDayLabel(date),
        count: clients.length,
        clients: clients.sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')),
      }))

  const upcoming = toDays(upcomingMap, true)
  const ended = toDays(endedMap, false)

  const countInRange = (from: string, toExclusive: string) =>
    upcoming.filter((day) => day.date >= from && day.date < toExclusive).reduce((sum, day) => sum + day.count, 0)

  return {
    summary: {
      timezone: COACHING_TIME_ZONE,
      today,
      endingToday: upcoming.find((day) => day.date === today)?.count ?? 0,
      endingNext7Days: countInRange(today, in7),
      endingNext30Days: countInRange(today, in30),
      upcomingTotal: upcoming.reduce((sum, day) => sum + day.count, 0),
      alreadyEnded: ended.reduce((sum, day) => sum + day.count, 0),
    },
    upcoming,
    ended,
  }
}
