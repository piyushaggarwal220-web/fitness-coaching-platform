/**
 * Backfill Meta CAPI Purchase events for captured purchases that were skipped or failed.
 *
 * Usage:
 *   npx tsx scripts/backfill-meta-purchases.ts
 *   npx tsx scripts/backfill-meta-purchases.ts --limit=20
 *   npx tsx scripts/backfill-meta-purchases.ts --within-days=5
 *
 * Production (uses Vercel env + CRON_SECRET):
 *   curl "https://app.lurvox.in/api/cron/meta-purchase-backfill?limit=50&secret=YOUR_CRON_SECRET"
 */
import { backfillMetaPurchases } from '../src/lib/analytics/meta-purchase-backfill'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const withinArg = args.find((a) => a.startsWith('--within-days='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 50
const withinDays = withinArg ? Number(withinArg.split('=')[1]) : 7

async function main() {
  const summary = await backfillMetaPurchases({
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    withinDays: Number.isFinite(withinDays) && withinDays > 0 ? withinDays : 7,
    dryRun,
  })

  console.log(JSON.stringify(summary, null, 2))

  if (summary.errors.length > 0 && summary.sent === 0 && summary.checked === 0) {
    process.exit(1)
  }
  if (summary.failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
