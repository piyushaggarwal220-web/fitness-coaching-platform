/**
 * Timing/behavior test for getCoachWorkQueue parallelism.
 * Uses a fake Supabase client that records query start/end to prove waves run concurrently.
 */
import assert from 'node:assert/strict'
import { getCoachWorkQueue } from '../src/lib/coach-work-queue'

type FakeRow = Record<string, unknown>

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type QueryLog = { table: string; startedAt: number; endedAt: number; select?: string }

function createFakeSupabase(opts: {
  clients: FakeRow[]
  generationJobs?: FakeRow[]
  drafts?: FakeRow[]
  activePlans?: FakeRow[]
  planChanges?: FakeRow[]
  checkins?: FakeRow[]
  callRequests?: FakeRow[]
  chats?: FakeRow[]
  issues?: FakeRow[]
  completions?: FakeRow[]
  latencyMs?: number
}) {
  const logs: QueryLog[] = []
  const latencyMs = opts.latencyMs ?? 40
  const t0 = Date.now()

  const dataFor = (table: string): FakeRow[] => {
    switch (table) {
      case 'profiles':
        return opts.clients
      case 'initial_plan_generation_jobs':
        return opts.generationJobs ?? []
      case 'plans':
        // Distinguish drafts vs active by looking at last filter — handled per builder below.
        return []
      case 'plan_change_requests':
        return opts.planChanges ?? []
      case 'checkins':
        return opts.checkins ?? []
      case 'call_requests':
        return opts.callRequests ?? []
      case 'coach_conversations':
        return opts.chats ?? []
      case 'issue_reports':
        return opts.issues ?? []
      case 'coach_work_queue_completions':
        return opts.completions ?? []
      default:
        return []
    }
  }

  function builder(table: string) {
    let selectCols = '*'
    let plansMode: 'drafts' | 'active' | 'unknown' = 'unknown'
    const api: Record<string, unknown> = {}
    const chain = (fn: (...args: unknown[]) => unknown) => {
      return (...args: unknown[]) => {
        fn(...args)
        return api
      }
    }

    api.select = chain((cols: unknown) => {
      selectCols = String(cols)
      if (table === 'plans' && selectCols === 'id, client_id, created_at') plansMode = 'drafts'
      if (table === 'plans' && selectCols === 'client_id') plansMode = 'active'
    })
    api.eq = chain((col: unknown, val: unknown) => {
      if (table === 'plans' && col === 'has_core_content' && val === true) {
        plansMode = 'active'
      }
      if (table === 'plans' && col === 'active' && val === true && plansMode === 'unknown') {
        plansMode = 'active'
      }
    })
    api.in = chain(() => {})
    api.is = chain(() => {})
    api.not = chain(() => {})
    api.neq = chain(() => {})
    api.gt = chain(() => {})
    api.order = chain(() => {})

    const run = async () => {
      const startedAt = Date.now() - t0
      await delay(latencyMs)
      const endedAt = Date.now() - t0
      logs.push({ table, startedAt, endedAt, select: selectCols })

      if (table === 'plans') {
        if (plansMode === 'drafts') return { data: opts.drafts ?? [], error: null }
        if (plansMode === 'active') return { data: opts.activePlans ?? [], error: null }
        return { data: [], error: null }
      }
      return { data: dataFor(table), error: null }
    }

    // Make the builder thenable so `await supabase.from(...).select()...` works.
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      run().then(resolve, reject)

    return api
  }

  return {
    logs,
    client: {
      from(table: string) {
        return builder(table)
      },
    },
  }
}

async function main() {
  const { client, logs } = createFakeSupabase({
    latencyMs: 50,
    clients: [
      {
        id: 'c1',
        name: 'Alex',
        email: 'a@example.com',
        plan_delivered: false,
        onboarding_complete: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        name: 'Sam',
        email: 's@example.com',
        plan_delivered: true,
        onboarding_complete: true,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    generationJobs: [
      {
        id: 'j1',
        client_id: 'c1',
        status: 'ready',
        draft_plan_id: 'p1',
        error_code: null,
        error_message: null,
        queued_at: '2026-01-03T00:00:00.000Z',
      },
    ],
    drafts: [{ id: 'p1', client_id: 'c1', created_at: '2026-01-03T00:00:00.000Z' }],
    activePlans: [],
    checkins: [
      {
        id: 'ck1',
        client_id: 'c2',
        submitted_at: '2026-01-04T00:00:00.000Z',
        checkin_type: 'weekly',
        coaching_week: 1,
      },
    ],
    chats: [
      {
        id: 'ch1',
        client_id: 'c2',
        unread_by_coach: 2,
        last_message_at: '2026-01-05T00:00:00.000Z',
        last_message_preview: 'Hi coach',
      },
    ],
  })

  const started = Date.now()
  const tasks = await getCoachWorkQueue(client as never, 'coach-1')
  const elapsed = Date.now() - started

  assert.ok(tasks.some((t) => t.id === 'plan-c1'))
  assert.ok(tasks.some((t) => t.id === 'checkin-ck1'))
  assert.ok(tasks.some((t) => t.id === 'chat-ch1'))

  // Wave 1 has 6 queries; wave 2 has up to 4. With 50ms latency each:
  // sequential ≈ 10 * 50 = 500ms+, parallel waves ≈ 2 * 50 = ~100ms (+overhead).
  const sequentialEstimateMs = logs.length * 50
  assert.ok(
    elapsed < 350,
    `expected parallel waves (~100–200ms), got ${elapsed}ms (logs=${JSON.stringify(logs)})`
  )
  assert.ok(
    elapsed < sequentialEstimateMs * 0.5,
    `parallel elapsed ${elapsed}ms should be < half of sequential estimate ${sequentialEstimateMs}ms`
  )

  const wave1Tables = new Set([
    'profiles',
    'plan_change_requests',
    'checkins',
    'call_requests',
    'coach_conversations',
    'coach_work_queue_completions',
  ])
  const wave1 = logs.filter((l) => wave1Tables.has(l.table))
  assert.equal(wave1.length, 6)

  // All wave-1 queries should overlap (start before the slowest wave-1 query finishes).
  const wave1StartMax = Math.max(...wave1.map((l) => l.startedAt))
  const wave1EndMin = Math.min(...wave1.map((l) => l.endedAt))
  assert.ok(
    wave1StartMax < wave1EndMin,
    `wave 1 queries did not overlap: ${JSON.stringify(wave1)}`
  )

  // Must not select nutrition/workout plan blobs.
  assert.ok(!logs.some((l) => (l.select ?? '').includes('nutrition_plan')))

  console.log(
    `✓ getCoachWorkQueue parallel waves ok (${elapsed}ms wall vs ~${sequentialEstimateMs}ms sequential estimate, ${logs.length} queries)`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
