/**
 * Route existing clients: paid < ₹1400 keep Smart Coach; paid more move to Piyush.
 * Dry-run by default. Pass --apply to write.
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { PIYUSH_COACH_ID } from '../src/lib/coach-delivery-policy'
import {
  maxCapturedPaidPaise,
  paidAmountQualifiesForPiyushHumanCoach,
  type PaidCoachPurchase,
} from '../src/lib/coach-routing'

const APPLY = process.argv.includes('--apply')
const CHUNK = 40

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const admin = createAdminClient()
  const { data: clients, error } = await admin
    .from('profiles')
    .select('id, coach_id, coach_service, payment_confirmed, role')
    .or('role.is.null,role.eq.client')
    .eq('payment_confirmed', true)
  if (error) throw new Error(error.message)

  const purchasesByUser = new Map<string, PaidCoachPurchase[]>()
  for (const group of chunk((clients ?? []).map((row) => row.id), 80)) {
    const { data, error: purchaseError } = await admin
      .from('purchases')
      .select('user_id, status, amount_paise, refunded_amount_paise, subscription_status, plan_slug')
      .in('user_id', group)
      .in('status', ['captured', 'redeemed'])
    if (purchaseError) throw new Error(purchaseError.message)
    for (const row of data ?? []) {
      const userId = String((row as { user_id?: string }).user_id ?? '')
      if (!userId) continue
      const list = purchasesByUser.get(userId) ?? []
      list.push(row as PaidCoachPurchase)
      purchasesByUser.set(userId, list)
    }
  }

  const toPiyush: string[] = []
  const keepAi: string[] = []
  let alreadyPiyush = 0
  let alreadyAi = 0

  for (const client of clients ?? []) {
    const maxPaid = maxCapturedPaidPaise(purchasesByUser.get(client.id) ?? [])
    if (paidAmountQualifiesForPiyushHumanCoach(maxPaid)) {
      if (client.coach_id === PIYUSH_COACH_ID && client.coach_service === 'human') alreadyPiyush += 1
      else toPiyush.push(client.id)
    } else if (client.coach_service === 'ai') {
      alreadyAi += 1
    } else {
      keepAi.push(client.id)
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        scanned: clients?.length ?? 0,
        toPiyush: toPiyush.length,
        keepAi: keepAi.length,
        alreadyPiyush,
        alreadyAi,
      },
      null,
      2
    )
  )

  if (!APPLY) {
    console.log('Dry-run only. Pass --apply to write.')
    return
  }

  const now = new Date().toISOString()
  for (const ids of chunk(toPiyush, CHUNK)) {
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        coach_id: PIYUSH_COACH_ID,
        coach_service: 'human',
        updated_at: now,
      })
      .in('id', ids)
    if (profileError) throw new Error(profileError.message)

    await Promise.all([
      admin.from('plans').update({ coach_id: PIYUSH_COACH_ID }).in('client_id', ids),
      admin.from('checkins').update({ coach_id: PIYUSH_COACH_ID }).in('client_id', ids),
      admin
        .from('coach_conversations')
        .update({ coach_id: PIYUSH_COACH_ID, updated_at: now })
        .in('client_id', ids),
      admin.from('call_requests').update({ coach_id: PIYUSH_COACH_ID }).in('client_id', ids),
      admin.from('plan_change_requests').update({ coach_id: PIYUSH_COACH_ID }).in('client_id', ids),
      admin
        .from('initial_plan_generation_jobs')
        .update({ coach_id: PIYUSH_COACH_ID })
        .in('client_id', ids),
    ])
  }

  for (const ids of chunk(keepAi, CHUNK)) {
    const { error: aiError } = await admin
      .from('profiles')
      .update({ coach_service: 'ai', updated_at: now })
      .in('id', ids)
    if (aiError) throw new Error(aiError.message)
  }

  const { data: piyush } = await admin
    .from('coaches')
    .select('hard_cap')
    .eq('id', PIYUSH_COACH_ID)
    .maybeSingle()
  if ((piyush?.hard_cap ?? 0) < 400) {
    await admin.from('coaches').update({ hard_cap: 1000 }).eq('id', PIYUSH_COACH_ID)
    console.log('Raised Piyush hard_cap to 1000')
  }

  console.log('Applied paid-amount coach routing.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
