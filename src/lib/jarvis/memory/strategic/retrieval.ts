/**
 * Bounded strategic retrieval + business snapshot + review.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  formatMemoryForPrompt,
  retrieveRelevantMemory,
  type MemoryRow,
} from '@/lib/jarvis/memory/retrieval'
import { kindFromRow, hierarchyLevelForKind } from '@/lib/jarvis/memory/kinds'
import { listOpenConflicts, explainConflict, scanConflictsAmong } from '@/lib/jarvis/memory/strategic/conflicts'
import type { BusinessKnowledgeSnapshot } from '@/lib/jarvis/memory/strategic/types'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'

export const STRATEGIC_RETRIEVAL_LIMITS = {
  max_memories: 12,
  max_evidence_items: 24,
  max_cost_usd: 0.05,
}

export async function searchStrategicMemory(input: {
  query: string
  funnelId?: string | null
  limit?: number
}) {
  const limit = Math.min(input.limit ?? STRATEGIC_RETRIEVAL_LIMITS.max_memories, 20)
  const pack = await retrieveRelevantMemory({
    query: input.query,
    limit,
    funnelId: input.funnelId ?? undefined,
  })

  const strategic = pack.memories.filter((m) => {
    const k = kindFromRow(m)
    return (
      hierarchyLevelForKind(k) >= 2 ||
      m.tags?.includes('strategic_insight') ||
      m.tags?.includes('pattern') ||
      k === 'OPERATING_RULE' ||
      k === 'LESSON'
    )
  })

  const conflicts = pack.conflicts.length
    ? pack.conflicts
    : (await scanConflictsAmong(strategic)).map((c) => ({
        type: 'strategic_conflict' as const,
        a: c.memory_a_id,
        b: c.memory_b_id,
        reason: c.reason,
      }))

  return {
    memories: strategic.slice(0, limit),
    conflicts,
    prompt: formatMemoryForPrompt(strategic.slice(0, limit), conflicts as never, {
      currentInstruction: input.query,
    }),
    limits: STRATEGIC_RETRIEVAL_LIMITS,
  }
}

export async function buildBusinessKnowledgeSnapshot(opts?: {
  funnelId?: string | null
}): Promise<BusinessKnowledgeSnapshot> {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_memory')
    .select('*')
    .in('memory_status', ['ACTIVE', 'STALE', 'CONFLICTED'])
    .order('updated_at', { ascending: false })
    .limit(80)
  if (opts?.funnelId) q = q.eq('funnel_id', opts.funnelId)
  const { data } = await q
  const rows = (data ?? []) as MemoryRow[]

  const byKind = (pred: (m: MemoryRow) => boolean, n = 5) =>
    rows
      .filter(pred)
      .slice(0, n)
      .map((m) => `${m.title}: ${m.summary}`.slice(0, 160))

  const openConflicts = await listOpenConflicts(10)

  return {
    generated_at: new Date().toISOString(),
    business_model: byKind((m) => m.category === 'funnel_economics' || m.category === 'business_rule', 4),
    funnels: byKind((m) => Boolean(m.funnel_id) || m.scope === 'FUNNEL', 6),
    economics: byKind((m) => /cpa|roas|revenue|spend/i.test(m.title + m.summary), 5),
    current_priorities: byKind((m) => m.tags?.includes('priority') || kindFromRow(m) === 'OPERATING_RULE', 4),
    known_constraints: byKind((m) => /constraint|limit|must not|blocked/i.test(m.summary), 4),
    recent_wins: byKind((m) => /success|improved|win/i.test(m.summary) && kindFromRow(m) === 'LESSON', 4),
    recent_failures: byKind(
      (m) => /fail|underperform|worse|hurt/i.test(m.summary) && ['LESSON', 'OUTCOME'].includes(kindFromRow(m)),
      4
    ),
    active_experiments: byKind((m) => m.category === 'experiment' || m.scope === 'EXPERIMENT', 4),
    strategic_patterns: byKind((m) => kindFromRow(m) === 'PATTERN' || m.tags?.includes('pattern'), 5),
    content_strategy: byKind((m) => /content|instagram|reel|creative/i.test(m.category + m.title), 4),
    marketing_patterns: byKind((m) => /meta|cpa|roas|campaign/i.test(m.summary), 4),
    operational_bottlenecks: byKind((m) => /stuck|blocked|overdue|fail/i.test(m.summary), 4),
    open_questions: byKind((m) => kindFromRow(m) === 'HYPOTHESIS', 5),
    stale_assumptions: byKind((m) => m.memory_status === 'STALE', 4),
    conflicts: openConflicts.map(explainConflict).slice(0, 6),
    limitations: [
      'Snapshot is bounded — not a full memory dump.',
      'Causality is not established unless evidence_label says otherwise.',
      'Taste preferences are excluded (Taste Engine owns aesthetics).',
      opts?.funnelId
        ? `Scoped to funnel ${opts.funnelId} — other funnels not mixed.`
        : 'No funnel filter — rows may include UNCLASSIFIED; do not blend ₹99 and ₹1,699 economics.',
    ],
  }
}

export async function runStrategicReview(input: {
  query?: string
  funnelId?: string | null
}): Promise<{
  ok: boolean
  review: Record<string, unknown>
  deferred?: boolean
  reason?: string
}> {
  const gate = await assertAiBudgetAvailable(STRATEGIC_RETRIEVAL_LIMITS.max_cost_usd)
  if (!gate.ok) {
    return {
      ok: false,
      deferred: true,
      reason: 'INVESTIGATION_DEFERRED_BUDGET',
      review: { note: gate.reason },
    }
  }

  const snapshot = await buildBusinessKnowledgeSnapshot({ funnelId: input.funnelId })
  const search = await searchStrategicMemory({
    query: input.query || 'strategic patterns lessons conflicts',
    funnelId: input.funnelId,
    limit: 10,
  })

  return {
    ok: true,
    review: {
      what_changed: snapshot.recent_wins.concat(snapshot.recent_failures).slice(0, 6),
      emerging_patterns: snapshot.strategic_patterns,
      uncertain: snapshot.open_questions,
      tested: snapshot.active_experiments,
      working: snapshot.recent_wins,
      not_working: snapshot.recent_failures,
      watch: snapshot.operational_bottlenecks,
      stale_assumptions: snapshot.stale_assumptions,
      conflicts: snapshot.conflicts,
      retrieved: search.memories.map((m) => ({
        id: m.id,
        kind: kindFromRow(m),
        title: m.title,
        confidence: m.confidence,
        funnel_id: m.funnel_id,
      })),
      limitations: snapshot.limitations,
      note: 'Structured review — not continuous LLM synthesis. Phase 12 policy remains authoritative for actions.',
    },
  }
}

export async function explainMemory(memoryId: string): Promise<{
  ok: boolean
  answer: string
  evidence: string[]
}> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_memory').select('*').eq('id', memoryId).maybeSingle()
  if (!data) return { ok: false, answer: 'Memory not found.', evidence: [] }

  const kind = kindFromRow(data as MemoryRow)
  const details = (data.details as Record<string, unknown>) || {}
  const evidence = Array.isArray(details.evidence)
    ? (details.evidence as string[])
    : Array.isArray(details.strategic_evidence)
      ? (details.strategic_evidence as unknown[]).map((e) => JSON.stringify(e).slice(0, 120))
      : []

  const answer = [
    `Kind: ${kind} (hierarchy level ${hierarchyLevelForKind(kind)}).`,
    `Title: ${data.title}.`,
    `Statement: ${data.summary}`,
    `Source: ${data.source || 'unknown'}.`,
    `Status: ${data.memory_status || 'ACTIVE'}.`,
    `Confidence: ${data.confidence || 'n/a'}.`,
    `Scope: ${data.scope || 'GLOBAL_BUSINESS'}${data.scope_id ? `/${data.scope_id}` : ''}.`,
    data.funnel_id ? `Funnel: ${data.funnel_id}.` : 'Funnel: UNCLASSIFIED / global.',
    details.causality ? `Causality stance: ${details.causality}.` : 'Causality: not established.',
    data.supersedes_id ? `Supersedes: ${data.supersedes_id}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return { ok: true, answer, evidence: evidence.map(String).slice(0, 20) }
}
