import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleWeeklyCallsForAllEligible } from '@/lib/weekly-call-schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Vercel cron: daily 04:00 UTC (09:30 IST) — ensure 12-month clients have a scheduled weekly call. */

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
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

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const summary = await scheduleWeeklyCallsForAllEligible(admin)
  console.log('[cron/weekly-call-schedule]', summary)
  return NextResponse.json(summary)
}

export async function POST(request: Request) {
  return GET(request)
}
