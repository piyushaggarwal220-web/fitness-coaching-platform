/**
 * Opportunity store — fingerprint upsert, lifecycle transitions.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import type {
  OpportunityRecord,
  OpportunityStatus,
  OpportunityType,
  ConfidenceBand,
  EvidenceStrength,
  Freshness,
  Uncertainty,
  Band,
  OpportunityScoreBreakdown,
} from '@/lib/jarvis/opportunities/types'
import { derivePriority, scoreOpportunity } from '@/lib/jarvis/opportunities/scoring'

export function opportunityBusinessFingerprint(input: {
  type: OpportunityType
  funnel_id: string | null
  key: string
}): string {
  const raw = `${input.type}|${input.funnel_id ?? 'UNCLASSIFIED'}|${input.key}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

function mapRow(row: Record<string, unknown>): OpportunityRecord {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    type: row.type as OpportunityType,
    title: String(row.title),
    summary: String(row.summary),
    status: row.status as OpportunityStatus,
    priority: row.priority as Band,
    funnel_id: (row.funnel_id as string) ?? null,
    system: String(row.system ?? 'OTHER'),
    source_event_ids: (row.source_event_ids as string[]) ?? [],
    source_memory_ids: (row.source_memory_ids as string[]) ?? [],
    source_decision_ids: (row.source_decision_ids as string[]) ?? [],
    source_measurement_ids: (row.source_measurement_ids as string[]) ?? [],
    evidence: (row.evidence as unknown[]) ?? [],
    observed_facts: (row.observed_facts as string[]) ?? [],
    inferences: (row.inferences as string[]) ?? [],
    hypotheses: (row.hypotheses as string[]) ?? [],
    recommendations: (row.recommendations as string[]) ?? [],
    confidence: row.confidence as ConfidenceBand,
    evidence_strength: row.evidence_strength as EvidenceStrength,
    freshness: row.freshness as Freshness,
    uncertainty: row.uncertainty as Uncertainty,
    expected_impact: (row.expected_impact as string) ?? null,
    impact_range: (row.impact_range as Record<string, unknown>) ?? {},
    impact_currency: String(row.impact_currency ?? 'INR'),
    impact_horizon: (row.impact_horizon as string) ?? null,
    actionability: row.actionability as 'LOW' | 'MEDIUM' | 'HIGH',
    urgency: row.urgency as Band,
    opportunity_cost: (row.opportunity_cost as string) ?? null,
    score_breakdown: (row.score_breakdown as OpportunityScoreBreakdown) ??
      scoreOpportunity({
        impact: 'MEDIUM',
        confidence: 'LOW',
        evidence_strength: 'INSUFFICIENT',
        urgency: 'MEDIUM',
        actionability: 'MEDIUM',
        freshness: 'UNKNOWN',
      }),
    goal_id: (row.goal_id as string) ?? null,
    plan_id: (row.plan_id as string) ?? null,
    snooze_until: (row.snooze_until as string) ?? null,
    expires_at: (row.expires_at as string) ?? null,
    last_validated_at: (row.last_validated_at as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export type UpsertOpportunityInput = {
  fingerprint: string
  type: OpportunityType
  title: string
  summary: string
  funnel_id?: string | null
  system?: string
  observed_facts: string[]
  inferences?: string[]
  hypotheses?: string[]
  recommendations?: string[]
  evidence?: unknown[]
  confidence?: ConfidenceBand
  evidence_strength?: EvidenceStrength
  freshness?: Freshness
  uncertainty?: Uncertainty
  impact?: Band
  urgency?: Band
  actionability?: 'LOW' | 'MEDIUM' | 'HIGH'
  expected_impact?: string | null
  impact_horizon?: string | null
  source_event_ids?: string[]
  source_memory_ids?: string[]
  expires_at?: string | null
  status?: OpportunityStatus
}

export async function upsertOpportunity(
  input: UpsertOpportunityInput
): Promise<{ ok: boolean; opportunity?: OpportunityRecord; created?: boolean; error?: string }> {
  const admin = createAdminClient()
  const score = scoreOpportunity({
    impact: input.impact ?? 'MEDIUM',
    confidence: input.confidence ?? 'LOW',
    evidence_strength: input.evidence_strength ?? 'INSUFFICIENT',
    urgency: input.urgency ?? 'MEDIUM',
    actionability: input.actionability ?? 'MEDIUM',
    freshness: input.freshness ?? 'UNKNOWN',
  })
  const priority = derivePriority(score)
  const payload = {
    fingerprint: input.fingerprint,
    type: input.type,
    title: input.title.slice(0, 200),
    summary: input.summary.slice(0, 2000),
    status: input.status ?? 'SCORED',
    priority,
    funnel_id: input.funnel_id ?? null,
    system: input.system ?? 'OTHER',
    source_event_ids: input.source_event_ids ?? [],
    source_memory_ids: input.source_memory_ids ?? [],
    evidence: input.evidence ?? [],
    observed_facts: input.observed_facts,
    inferences: input.inferences ?? [],
    hypotheses: input.hypotheses ?? [],
    recommendations: input.recommendations ?? [],
    confidence: input.confidence ?? 'LOW',
    evidence_strength: input.evidence_strength ?? 'INSUFFICIENT',
    freshness: input.freshness ?? 'UNKNOWN',
    uncertainty: input.uncertainty ?? 'UNKNOWN',
    expected_impact: input.expected_impact ?? null,
    impact_horizon: input.impact_horizon ?? null,
    actionability: input.actionability ?? 'MEDIUM',
    urgency: input.urgency ?? 'MEDIUM',
    score_breakdown: score,
    expires_at: input.expires_at ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await admin
    .from('jarvis_opportunities')
    .select('id, status')
    .eq('fingerprint', input.fingerprint)
    .maybeSingle()

  if (existing) {
    // Do not revive DISMISSED/EXPIRED via silent upsert
    if (['DISMISSED', 'EXPIRED', 'SUPERSEDED'].includes(String(existing.status))) {
      const { data } = await admin.from('jarvis_opportunities').select('*').eq('id', existing.id).single()
      return { ok: true, opportunity: data ? mapRow(data) : undefined, created: false }
    }
    const { data, error } = await admin
      .from('jarvis_opportunities')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, opportunity: mapRow(data), created: false }
  }

  const { data, error } = await admin
    .from('jarvis_opportunities')
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, opportunity: mapRow(data), created: true }
}

export async function getOpportunity(id: string): Promise<OpportunityRecord | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_opportunities').select('*').eq('id', id).maybeSingle()
  return data ? mapRow(data) : null
}

export async function listOpportunities(input?: {
  status?: OpportunityStatus | OpportunityStatus[]
  funnel_id?: string | null
  limit?: number
}): Promise<OpportunityRecord[]> {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_opportunities')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(input?.limit ?? 40)
  if (input?.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status]
    q = q.in('status', statuses)
  }
  if (input?.funnel_id) q = q.eq('funnel_id', input.funnel_id)
  if (input?.funnel_id === null) q = q.is('funnel_id', null)
  const { data } = await q
  return (data ?? []).map((r) => mapRow(r))
}

export async function transitionOpportunity(input: {
  id: string
  status: OpportunityStatus
  reason?: string
  snooze_until?: string | null
}): Promise<{ ok: boolean; opportunity?: OpportunityRecord; error?: string }> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  }
  if (input.status === 'SNOOZED') patch.snooze_until = input.snooze_until ?? null
  if (input.status === 'VALIDATED') patch.last_validated_at = new Date().toISOString()
  if (input.reason) {
    const { data: row } = await admin
      .from('jarvis_opportunities')
      .select('evidence')
      .eq('id', input.id)
      .maybeSingle()
    const evidence = Array.isArray(row?.evidence) ? [...row.evidence] : []
    evidence.push({ type: 'status_transition', status: input.status, reason: input.reason })
    patch.evidence = evidence
  }
  const { data, error } = await admin
    .from('jarvis_opportunities')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, opportunity: mapRow(data) }
}

export async function getOpportunityHealth(): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const statuses = [
    'DETECTED',
    'SCORED',
    'INVESTIGATING',
    'VALIDATED',
    'PROPOSED',
    'DISMISSED',
    'EXPIRED',
    'SNOOZED',
  ] as const
  const counts: Record<string, number> = {}
  for (const s of statuses) {
    const { count } = await admin
      .from('jarvis_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('status', s)
    counts[s.toLowerCase()] = count ?? 0
  }
  const { count: total } = await admin
    .from('jarvis_opportunities')
    .select('id', { count: 'exact', head: true })
  return {
    total: total ?? 0,
    ...counts,
    note: 'Phase 15 opportunity health — niche/video opportunity tables remain separate.',
  }
}
