import { NextResponse } from 'next/server'
import { processDueCheckinAutoReplies } from '@/lib/checkin-auto-reply'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Weekly rows may need a plan publish + AI message, so allow generous headroom. */
export const maxDuration = 300

/**
 * Sends check-in replies and updated plans that have come due (26–28 minutes after submission,
 * including overnight).
 *
 * Driven every minute by pg_cron in Supabase. Safe to call more often — each check-in is claimed
 * with a conditional update before anything is sent.
 *
 * When OpenAI has no credits, the sweep does not start plan generation. It waits 15 minutes,
 * emails the operator once, and tries a small credit check again. Delivery resumes on its own
 * after that check succeeds.
 */
function authorizeCron(request: Request): boolean {
  // AUTO_REPLY_CRON_SECRET is dedicated to the Supabase pg_cron caller; CRON_SECRET is accepted
  // too so the endpoint can also be triggered by Vercel cron or a manual run.
  const secrets = [process.env.AUTO_REPLY_CRON_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      return false
    }
    return true
  }

  const header = request.headers.get('authorization')
  const query = new URL(request.url).searchParams.get('secret')
  return secrets.some((secret) => header === `Bearer ${secret}` || query === secret)
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : undefined

  try {
    const summary = await processDueCheckinAutoReplies(createAdminClient(), { limit })
    if (summary.due > 0 || summary.deferredForQuietHours) {
      console.log('[cron/checkin-auto-reply]', {
        due: summary.due,
        sent: summary.sent,
        skipped: summary.skipped,
        failed: summary.failed,
        deferredForQuietHours: summary.deferredForQuietHours,
        billingHold: summary.billingHold,
      })
    }
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-reply sweep failed'
    console.error('[cron/checkin-auto-reply] failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
