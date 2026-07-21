import { NextResponse } from 'next/server'
import { processNotificationJobs } from '@/lib/notifications/worker'
import { DAILY_RECONCILIATION_LIMIT } from '@/lib/notifications/drain-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Hobby-compatible daily reconciliation; normal delivery is event-driven via after(). */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await processNotificationJobs(DAILY_RECONCILIATION_LIMIT))
  } catch (error) {
    console.error('[cron/notification-delivery]', error)
    return NextResponse.json({ error: 'Notification worker failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
