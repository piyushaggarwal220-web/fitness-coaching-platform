import { COACHING_TIME_ZONE, getCoachingDateKey } from '@/lib/checkin-schedule'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'

export type ExpectedEnrollmentLead = {
  id: string
  name: string
  email: string
  phone: string
  preferredTime: string | null
  goal: string
  submittedAt: string
  expectedDate: string
  source: 'talk_to_coach'
}

export type ExpectedEnrollmentDay = {
  date: string
  label: string
  count: number
  leads: ExpectedEnrollmentLead[]
}

export type ExpectedEnrollmentsSummary = {
  timezone: string
  today: string
  openLeads: number
  expectedToday: number
  expectedTomorrow: number
  overdue: number
  anytimeOrUnspecified: number
}

export type ExpectedEnrollmentsPayload = {
  summary: ExpectedEnrollmentsSummary
  byExpectedDay: ExpectedEnrollmentDay[]
  overdue: ExpectedEnrollmentDay | null
  anytime: ExpectedEnrollmentDay | null
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

function parsePreferredTime(message: string): { preferredTime: string | null; goal: string } {
  const match = message.match(/^Preferred call time:\s*(.+?)\s*(?:\n\n|\n|$)/i)
  if (!match) return { preferredTime: null, goal: message.trim() }
  return {
    preferredTime: match[1].trim(),
    goal: message.slice(match[0].length).trim(),
  }
}

function resolveExpectedDate(
  submittedDate: string,
  preferredTime: string | null
): { kind: 'day' | 'anytime'; date: string } {
  const value = (preferredTime ?? '').toLowerCase()
  if (!value) return { kind: 'anytime', date: submittedDate }
  if (value.includes('tomorrow')) return { kind: 'day', date: addDays(submittedDate, 1) }
  if (value.includes('anytime')) return { kind: 'anytime', date: submittedDate }
  // Morning / Afternoon / Evening → call on submission day
  return { kind: 'day', date: submittedDate }
}

export async function getExpectedEnrollments(): Promise<ExpectedEnrollmentsPayload> {
  const admin = createAdminClient()
  const now = new Date()
  const today = getCoachingDateKey(now)
  const tomorrow = addDays(today, 1)

  const [{ data: submissions, error }, { data: paidProfiles }, { data: capturedPurchases }] =
    await Promise.all([
      admin
        .from('talk_to_coach_submissions')
        .select('id, name, email, phone, message, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      admin
        .from('profiles')
        .select('email')
        .eq('role', 'client')
        .eq('payment_confirmed', true),
      admin.from('purchases').select('customer_email').eq('status', 'captured'),
    ])

  if (error) throw new Error(error.message)

  const enrolledEmails = new Set<string>()
  for (const row of paidProfiles ?? []) {
    const email = (row.email as string | null)?.trim().toLowerCase()
    if (email) enrolledEmails.add(email)
  }
  for (const row of capturedPurchases ?? []) {
    const email = (row.customer_email as string | null)?.trim().toLowerCase()
    if (email) enrolledEmails.add(email)
  }

  const dayMap = new Map<string, ExpectedEnrollmentLead[]>()
  const overdueLeads: ExpectedEnrollmentLead[] = []
  const anytimeLeads: ExpectedEnrollmentLead[] = []
  const seenPhones = new Set<string>()

  for (const row of submissions ?? []) {
    const phoneRaw = String(row.phone ?? '').trim()
    const phone = normalizePhoneForWhatsApp(phoneRaw) ?? phoneRaw.replace(/\D/g, '')
    if (!phone || phone.length < 10) continue

    const email = String(row.email ?? '')
      .trim()
      .toLowerCase()
    if (email && enrolledEmails.has(email)) continue
    if (seenPhones.has(phone)) continue
    seenPhones.add(phone)

    const { preferredTime, goal } = parsePreferredTime(String(row.message ?? ''))
    const submittedAt = String(row.created_at)
    const submittedDate = getCoachingDateKey(new Date(submittedAt))
    const expected = resolveExpectedDate(submittedDate, preferredTime)

    const lead: ExpectedEnrollmentLead = {
      id: String(row.id),
      name: String(row.name ?? ''),
      email: email || '—',
      phone: phoneRaw || phone,
      preferredTime,
      goal: goal || '—',
      submittedAt,
      expectedDate: expected.date,
      source: 'talk_to_coach',
    }

    if (expected.kind === 'anytime') {
      anytimeLeads.push(lead)
      continue
    }

    if (expected.date < today) {
      overdueLeads.push(lead)
      continue
    }

    const list = dayMap.get(expected.date) ?? []
    list.push(lead)
    dayMap.set(expected.date, list)
  }

  const byExpectedDay: ExpectedEnrollmentDay[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, leads]) => ({
      date,
      label: formatDayLabel(date),
      count: leads.length,
      leads: leads.sort((a, b) => a.name.localeCompare(b.name)),
    }))

  const overdue: ExpectedEnrollmentDay | null =
    overdueLeads.length > 0
      ? {
          date: 'overdue',
          label: 'Overdue follow-up',
          count: overdueLeads.length,
          leads: overdueLeads.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
        }
      : null

  const anytime: ExpectedEnrollmentDay | null =
    anytimeLeads.length > 0
      ? {
          date: 'anytime',
          label: 'Anytime / no day set',
          count: anytimeLeads.length,
          leads: anytimeLeads.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
        }
      : null

  const expectedToday = byExpectedDay.find((d) => d.date === today)?.count ?? 0
  const expectedTomorrow = byExpectedDay.find((d) => d.date === tomorrow)?.count ?? 0
  const openLeads =
    byExpectedDay.reduce((sum, d) => sum + d.count, 0) +
    (overdue?.count ?? 0) +
    (anytime?.count ?? 0)

  return {
    summary: {
      timezone: COACHING_TIME_ZONE,
      today,
      openLeads,
      expectedToday,
      expectedTomorrow,
      overdue: overdue?.count ?? 0,
      anytimeOrUnspecified: anytime?.count ?? 0,
    },
    byExpectedDay,
    overdue,
    anytime,
  }
}
