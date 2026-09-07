/**
 * Generate and publish weekly AI drafts for check-ins that only got a coach note.
 *
 *   npx tsx --env-file=.env.local.txt scripts/send-missed-weekly-plans.ts
 */
import { hasClientEntitlement } from '../src/lib/entitlements'
import { generateWeeklyPlanDraft } from '../src/lib/ai/weekly-plan-draft'
import { sendNotification } from '../src/lib/notifications/dispatcher'
import { activatePlan } from '../src/lib/plans'
import { createAdminClient } from '../src/lib/supabase/admin'

const START = '2026-09-05T18:30:00.000Z'
const CONCURRENCY = 2

type CheckinRow = {
  id: string
  client_id: string
  coach_id: string
  coaching_week: number
  submitted_at: string
}

async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

async function main() {
  const admin = createAdminClient()
  const { data: checkins, error } = await admin
    .from('checkins')
    .select('id, client_id, coach_id, coaching_week, submitted_at')
    .eq('checkin_type', 'weekly')
    .gte('submitted_at', START)
    .order('submitted_at', { ascending: true })

  if (error) throw new Error(error.message)

  const rows = (checkins ?? []) as CheckinRow[]
  console.log(`weekly check-ins since ${START}: ${rows.length}`)

  const queued: CheckinRow[] = []
  let skipped = 0

  for (const checkin of rows) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, email, payment_confirmed, access_source, subscription_expires_at')
      .eq('id', checkin.client_id)
      .maybeSingle()

    const name = profile?.name ?? checkin.client_id
    if (profile?.email?.includes('@lurvox.test')) {
      console.log(`SKIP trial ${name}`)
      skipped += 1
      continue
    }

    if (!hasClientEntitlement(profile)) {
      console.log(`SKIP no entitlement ${name}`)
      skipped += 1
      continue
    }

    const { data: active } = await admin
      .from('plans')
      .select('id, delivered_at')
      .eq('client_id', checkin.client_id)
      .eq('active', true)
      .maybeSingle()

    const alreadyUpdated =
      active?.delivered_at &&
      new Date(active.delivered_at).getTime() >= new Date(checkin.submitted_at).getTime()
    if (alreadyUpdated) {
      console.log(`SKIP already updated ${name}`)
      skipped += 1
      continue
    }

    queued.push(checkin)
    console.log(`QUEUE ${name} week ${checkin.coaching_week} checkin ${checkin.id}`)
  }

  console.log(`queued=${queued.length} skipped=${skipped} concurrency=${CONCURRENCY}`)

  let sent = 0
  let failed = 0

  await mapPool(queued, CONCURRENCY, async (checkin) => {
    const { data: profile } = await admin
      .from('profiles')
      .select('name')
      .eq('id', checkin.client_id)
      .maybeSingle()
    const name = profile?.name ?? checkin.client_id

    const { data: active } = await admin
      .from('plans')
      .select('delivered_at')
      .eq('client_id', checkin.client_id)
      .eq('active', true)
      .maybeSingle()
    if (
      active?.delivered_at &&
      new Date(active.delivered_at).getTime() >= new Date(checkin.submitted_at).getTime()
    ) {
      console.log(`SKIP already updated ${name}`)
      skipped += 1
      return
    }

    console.log(`GENERATE ${name} week ${checkin.coaching_week} checkin ${checkin.id}`)
    const result = await generateWeeklyPlanDraft({
      clientId: checkin.client_id,
      coachId: checkin.coach_id,
      checkinId: checkin.id,
      coachingWeek: checkin.coaching_week,
      trigger: 'retry',
    })

    if (result.error || !result.planId) {
      failed += 1
      console.error(`FAIL generate ${name}: ${result.error ?? 'no planId'}`)
      return
    }

    const published = await activatePlan(
      admin,
      {
        id: result.planId,
        client_id: checkin.client_id,
        coach_id: checkin.coach_id,
      },
      { skipReplyWait: true }
    )
    if (published.error) {
      failed += 1
      console.error(`FAIL publish ${name}: ${published.error}`)
      return
    }

    await sendNotification({
      userId: checkin.client_id,
      type: 'plan_delivered',
      title: 'Your updated plan is ready',
      body: 'Your coach published this week’s diet and workout. Open Plan or Tracker to follow it.',
      actionUrl: '/plan',
      metadata: { checkinId: checkin.id, planId: result.planId, backfill: true },
      idempotencyKey: `missed-weekly-plan:${checkin.id}`,
    })
    sent += 1
    console.log(`SENT ${name} plan ${result.planId} in ${result.generationTimeMs}ms`)
  })

  console.log(`DONE sent=${sent} failed=${failed} skipped=${skipped} queued=${queued.length}`)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
