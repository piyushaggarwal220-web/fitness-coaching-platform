import { NextResponse } from 'next/server'
import { runAutoWeeklyCallBookings } from '@/lib/auto-weekly-calls-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Vercel cron: 45 2 * * * (02:45 UTC = 08:15 IST), shortly after check-in reminders. */

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

  try {
    const summary = await runAutoWeeklyCallBookings(new Date())
    console.log('[cron/auto-weekly-calls]', {
      checked: summary.checked,
      created: summary.created,
      alreadyBooked: summary.alreadyBooked,
      skipped: summary.skipped,
    })
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto weekly call booking failed'
    console.error('[cron/auto-weekly-calls]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Allow POST for manual triggers with the same auth. */
export async function POST(request: Request) {
  return GET(request)
}
