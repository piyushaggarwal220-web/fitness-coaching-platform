/**
 * Backfill / refresh AI mid-week client replies for unreviewed Day 3 check-ins.
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-midweek-replies.ts
 *   npx tsx --env-file=.env.local scripts/backfill-midweek-replies.ts --force --limit=50
 */
import { backfillMidWeekReplies } from '../src/lib/ai/midweek-analysis'

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50
  const coachArg = process.argv.find((a) => a.startsWith('--coach='))
  const coachId = coachArg ? coachArg.split('=')[1] : null
  const force = process.argv.includes('--force')

  console.log('[backfill-midweek] starting', { limit, coachId, force })
  const result = await backfillMidWeekReplies({ coachId, limit, force })
  console.log('[backfill-midweek] done', result)
  if (result.failed.length) {
    for (const f of result.failed) {
      console.error('[backfill-midweek] failed', f.checkinId, f.error)
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[backfill-midweek] fatal', err)
  process.exit(1)
})
