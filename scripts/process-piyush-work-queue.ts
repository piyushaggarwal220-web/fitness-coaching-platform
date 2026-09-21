/**
 * Drain Piyush and Rakshit work queues: AI-complete everything except phone calls
 * and chats that need a human (refund / emergency / "call me").
 *
 *   npx tsx --import ./scripts/shims/alias-server-only.cjs --env-file=.env.local scripts/process-piyush-work-queue.ts
 *   npx tsx --import ./scripts/shims/alias-server-only.cjs --env-file=.env.local.txt scripts/process-piyush-work-queue.ts
 *
 * Optional:
 *   PASSES=3           — how many queue sweeps (default 4)
 *   DRY_RUN=1          — print the queue and exit
 *   COACH=piyush|rakshit — one coach only (default: both)
 */
import { getCoachWorkQueue } from '../src/lib/coach-work-queue'
import { PIYUSH_COACH_ID, RAKSHIT_COACH_ID } from '../src/lib/coach-delivery-policy'
import { processCoachWorkQueue } from '../src/lib/piyush-work-queue-auto'
import { createAdminClient } from '../src/lib/supabase/admin'

const PASSES = Math.min(8, Math.max(1, Number(process.env.PASSES ?? '4') || 4))
const DRY_RUN = process.env.DRY_RUN === '1'
const COACH_FILTER = (process.env.COACH ?? '').trim().toLowerCase()

const COACHES = [
  { id: PIYUSH_COACH_ID, label: 'Piyush' },
  { id: RAKSHIT_COACH_ID, label: 'Rakshit' },
].filter((coach) => {
  if (!COACH_FILTER) return true
  if (COACH_FILTER === 'piyush') return coach.id === PIYUSH_COACH_ID
  if (COACH_FILTER === 'rakshit') return coach.id === RAKSHIT_COACH_ID
  return true
})

function isCreditError(message: string | null | undefined): boolean {
  return /credit balance is too low|insufficient_quota/i.test(message ?? '')
}

async function main() {
  if (process.env.AI_PLAN_PROVIDER?.trim().toLowerCase() === 'claude') {
    throw new Error('AI_PLAN_PROVIDER=claude is disabled. Live generation is OpenAI-only.')
  }
  process.env.AI_PLAN_PROVIDER = 'openai'
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is empty.')
  }

  const admin = createAdminClient()

  for (const coach of COACHES) {
    const queued = await getCoachWorkQueue(admin, coach.id)
    console.log(`\n${coach.label} queue=${queued.length}`)
    for (const task of queued) {
      console.log(`  ${task.type.padEnd(22)} ${task.clientName ?? ''}  ${task.title}`)
    }
  }

  if (DRY_RUN) return

  for (const coach of COACHES) {
    for (let pass = 1; pass <= PASSES; pass += 1) {
      console.log(`\n${coach.label} PASS ${pass}/${PASSES}`)
      const summary = await processCoachWorkQueue(admin, coach.id, {
        chatLimit: 12,
        checkinLimit: 3,
        planChangeLimit: 4,
        certificateLimit: 20,
        issueLimit: 40,
        initialPlanLimit: 2,
        ignoreCheckinDelay: true,
      })
      console.log(
        `due=${summary.due} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed} left=${summary.leftForCoach}`
      )
      for (const row of summary.results) {
        console.log(`  ${row.status.toUpperCase()} ${row.type} ${row.clientName ?? ''} — ${row.detail}`)
        if (row.status === 'failed' && isCreditError(row.detail)) {
          console.error('STOP OpenAI credits empty')
          process.exitCode = 1
          return
        }
      }
      if (summary.due === 0 || (summary.sent === 0 && summary.failed === 0 && summary.skipped === 0)) {
        break
      }
    }

    const remaining = await getCoachWorkQueue(admin, coach.id)
    console.log(`\n${coach.label} REMAINING ${remaining.length}`)
    for (const task of remaining) {
      console.log(`  ${task.type.padEnd(22)} ${task.clientName ?? ''}  ${task.title}`)
    }
  }
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
