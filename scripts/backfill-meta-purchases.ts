/**
 * Backfill Meta CAPI Purchase events for captured purchases that were skipped or never sent.
 *
 * Usage:
 *   npx tsx scripts/backfill-meta-purchases.ts
 *   npx tsx scripts/backfill-meta-purchases.ts --limit 20
 *   npx tsx scripts/backfill-meta-purchases.ts --dry-run
 */
import { sendMetaPurchase } from '../src/lib/analytics/meta-conversions'
import { createAdminClient } from '../src/lib/supabase/admin'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 50

async function main() {
  if (!process.env.META_CONVERSIONS_API_TOKEN?.trim()) {
    console.error('META_CONVERSIONS_API_TOKEN is not set — cannot backfill.')
    process.exit(1)
  }

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('purchases')
    .select(
      'id, razorpay_payment_id, customer_email, customer_phone, amount_paise, currency, plan_slug, meta_purchase_status, created_at'
    )
    .eq('status', 'captured')
    .neq('plan_slug', 'exercise_library')
    .in('meta_purchase_status', ['skipped_no_config', 'failed'])
    .order('created_at', { ascending: true })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 50)

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('No purchases need Meta backfill.')
    return
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Backfilling ${rows.length} purchase(s)...`)

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    const label = `${row.id.slice(0, 8)} ${row.customer_email} ${row.plan_slug}`
    if (dryRun) {
      console.log(`  would send: ${label}`)
      continue
    }

    const result = await sendMetaPurchase({
      purchaseId: row.id,
      paymentId: row.razorpay_payment_id,
      email: row.customer_email,
      phone: row.customer_phone,
      amountPaise: row.amount_paise,
      currency: row.currency || 'INR',
      planSlug: row.plan_slug,
      eventTime: Math.floor(new Date(row.created_at).getTime() / 1000),
    })

    if (result.skipped) {
      skipped += 1
      console.log(`  skipped: ${label}`)
    } else if (result.ok) {
      sent += 1
      console.log(`  sent: ${label}`)
    } else {
      failed += 1
      console.error(`  failed: ${label} — ${result.error}`)
    }

    await new Promise((r) => setTimeout(r, 300))
  }

  console.log(`Done. sent=${sent} failed=${failed} skipped=${skipped}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
