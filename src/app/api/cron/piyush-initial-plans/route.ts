import { after, NextResponse } from 'next/server'
import { processPiyushPendingInitialPlans, runPiyushInitialPlanForClient } from '@/lib/piyush-initial-plan-auto'
import { processAutoCoachWorkQueues } from '@/lib/piyush-work-queue-auto'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorize(request: Request): boolean {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.AUTO_REPLY_CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
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

/**
 * Auto-coach: drain AI-capable work for Piyush and Rakshit (plans, check-ins, chats,
 * certificates) and leave only phone calls / human-only chats.
 *
 *   GET/POST /api/cron/piyush-initial-plans?limit=2
 *   Optional: &clientId=<uuid> to process one initial-plan client
 *   Optional: &sync=1 to generate inline (default: background after response)
 *   Optional: &queue=0 to skip the full work-queue sweep
 */
async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limit = Math.min(5, Math.max(1, Number(url.searchParams.get('limit') ?? '2') || 2))
  const clientId = url.searchParams.get('clientId')?.trim() || null
  const sync = url.searchParams.get('sync') === '1'
  const skipQueue = url.searchParams.get('queue') === '0'
  const ignoreDelay = url.searchParams.get('ignoreDelay') === '1'

  const admin = createAdminClient()

  if (clientId) {
    if (sync) {
      const result = await runPiyushInitialPlanForClient(admin, clientId)
      return NextResponse.json({ ok: true, sync: true, results: [result] })
    }

    const prepared = await runPiyushInitialPlanForClient(admin, clientId, {
      processInBackground: true,
    })
    if (prepared.status === 'generating' && prepared.detail.includes('queued for background')) {
      const jobMatch = prepared.detail.match(/job ([0-9a-f-]+)/i)
      const jobId = jobMatch?.[1]
      if (jobId) {
        after(() =>
          import('@/lib/initial-plan-generation').then(({ processInitialPlanGeneration }) =>
            processInitialPlanGeneration(jobId).catch((err) => {
              console.error(
                '[cron/piyush-initial-plans] background generation failed:',
                jobId,
                err instanceof Error ? err.message : err
              )
            })
          )
        )
      }
    }
    return NextResponse.json({ ok: true, sync: false, results: [prepared] })
  }

  const queue = skipQueue
    ? null
    : await processAutoCoachWorkQueues(admin, {
        initialPlanLimit: 0,
        checkinLimit: 4,
        chatLimit: 8,
        ignoreCheckinDelay: ignoreDelay,
      })

  if (sync) {
    const results = await processPiyushPendingInitialPlans(admin, limit)
    return NextResponse.json({
      ok: true,
      sync: true,
      processed: results.length,
      results,
      queue,
    })
  }

  const prepared = await processPiyushPendingInitialPlans(admin, limit, {
    processInBackground: true,
  })

  for (const row of prepared) {
    if (row.status !== 'generating') continue
    if (!row.detail.includes('queued for background')) continue
    const jobMatch = row.detail.match(/job ([0-9a-f-]+)/i)
    const jobId = jobMatch?.[1]
    if (!jobId) continue
    after(() =>
      import('@/lib/initial-plan-generation').then(({ processInitialPlanGeneration }) =>
        processInitialPlanGeneration(jobId).catch((err) => {
          console.error(
            '[cron/piyush-initial-plans] background generation failed:',
            jobId,
            err instanceof Error ? err.message : err
          )
        })
      )
    )
  }

  return NextResponse.json({
    ok: true,
    sync: false,
    processed: prepared.length,
    results: prepared,
    queue,
  })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
