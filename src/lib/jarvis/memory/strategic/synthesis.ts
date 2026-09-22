/**
 * Decision/event → strategic memory bridges.
 * Event ≠ memory. One spike → OBSERVATION. ≥3 similar → PATTERN candidate.
 * Never invents causality. Never bypasses remember()/validateMemoryWrite.
 */

import { writeStrategicMemory } from '@/lib/jarvis/memory/strategic/write'
import { buildEvidenceItem, canPromoteToPattern } from '@/lib/jarvis/memory/strategic/evidence'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MemoryScope } from '@/lib/jarvis/memory/scopes'

export async function recordEventAsObservation(input: {
  eventId: string
  eventType: string
  funnelId: string | null
  significance: string
  reason: string
  metric?: string | null
  before?: number | null
  after?: number | null
}): Promise<{ ok: boolean; kind: 'OBSERVATION' | 'skipped'; id?: string }> {
  if (!['INVESTIGATE', 'ALERT', 'URGENT'].includes(input.significance)) {
    return { ok: true, kind: 'skipped' }
  }

  const evidence = [
    buildEvidenceItem({
      source_type: 'EVENT',
      source_id: input.eventId,
      metric: input.metric ?? null,
      before_value: input.before ?? null,
      after_value: input.after ?? null,
      sample_size: 1,
      notes: input.reason.slice(0, 200),
    }),
  ]

  const row = await writeStrategicMemory({
    kind: 'OBSERVATION',
    level: 1,
    title: `Observation: ${input.eventType}`,
    statement: `Observed event ${input.eventType}. ${input.reason.slice(0, 400)}. Single event — not a pattern. Causality is not established.`,
    scope: input.funnelId ? 'FUNNEL' : 'GLOBAL_BUSINESS',
    scope_id: input.funnelId,
    funnel_id: input.funnelId,
    source: 'jarvis.events',
    source_type: 'EVENT',
    evidence,
    evidence_label: 'OBSERVED',
    confidence: 'LOW',
    causality: 'TEMPORAL_ASSOCIATION',
    sample_size: 1,
    tags: ['event_evidence', input.eventType],
    domain: 'STRATEGY',
  })

  return { ok: true, kind: 'OBSERVATION', id: (row as { id?: string })?.id }
}

/**
 * After outcome measurement: if ≥3 similar observations, write PATTERN (not silent rule).
 */
export async function maybePromoteOutcomePattern(input: {
  decisionId: string
  system: string
  scope: MemoryScope
  scopeId: string | null
  funnelId: string | null
  metric: string
  sampleSize: number
  statement: string
  before: number | null
  after: number | null
  windowHours: number
}): Promise<{ promoted: boolean; id?: string }> {
  if (!canPromoteToPattern(input.sampleSize)) {
    return { promoted: false }
  }

  const evidence = [
    buildEvidenceItem({
      source_type: 'OUTCOME',
      source_id: input.decisionId,
      metric: input.metric,
      before_value: input.before,
      after_value: input.after,
      window: `${input.windowHours}h`,
      sample_size: input.sampleSize,
      notes: 'Promoted from repeated outcome observations — correlation/temporal only.',
    }),
  ]

  const row = await writeStrategicMemory({
    kind: 'PATTERN',
    level: 2,
    title: `Pattern: ${input.metric} after ${input.system} actions`,
    statement: `${input.statement.slice(0, 800)} Pattern candidate from n=${input.sampleSize}. Causality is not established.`,
    scope: input.scope,
    scope_id: input.scopeId,
    funnel_id: input.funnelId,
    source: 'jarvis.outcome_engine',
    source_type: 'OUTCOME',
    evidence,
    evidence_label: 'REPEATED_PATTERN',
    confidence: input.sampleSize >= 5 ? 'HIGH' : 'MEDIUM',
    causality: 'TEMPORAL_ASSOCIATION',
    sample_size: input.sampleSize,
    tags: ['pattern', 'from_outcome', input.system],
    domain: 'STRATEGY',
  })

  return { promoted: true, id: (row as { id?: string })?.id }
}

/** Research reuse: recent high-confidence strategic answer before expensive research. */
export async function findRecentStrategicAnswer(input: {
  query: string
  funnelId?: string | null
  maxAgeDays?: number
}): Promise<{ reuse: boolean; memory?: { id: string; summary: string; status: string } }> {
  const admin = createAdminClient()
  const since = new Date(
    Date.now() - (input.maxAgeDays ?? 14) * 86400_000
  ).toISOString()
  const tokens = input.query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)
    .slice(0, 4)

  let q = admin
    .from('jarvis_memory')
    .select('id, summary, memory_status, confidence, funnel_id, updated_at')
    .eq('memory_status', 'ACTIVE')
    .in('confidence', ['high', 'medium'])
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (input.funnelId) {
    q = q.eq('funnel_id', input.funnelId)
  }

  const { data } = await q
  const hit = (data ?? []).find((m) => {
    const s = (m.summary || '').toLowerCase()
    return tokens.some((t) => s.includes(t))
  })

  if (!hit) return { reuse: false }
  if (hit.memory_status === 'STALE') {
    return {
      reuse: false,
      memory: { id: hit.id, summary: hit.summary, status: 'STALE' },
    }
  }
  return {
    reuse: true,
    memory: { id: hit.id, summary: hit.summary, status: hit.memory_status },
  }
}
