/**
 * Phase 21 — Long-horizon management (extends Phase 16 strategic plans).
 * No second plan brain. Phase 12 remains execution authority.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { StrategicPlanRecord } from '@/lib/jarvis/strategy'
import { listGoals, listStrategicPlans, getStrategicPlan } from '@/lib/jarvis/strategy'
import { listOpportunities } from '@/lib/jarvis/opportunities/store'
import { listExperiments } from '@/lib/jarvis/experiments'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'

export type TimeHorizon = '7_DAYS' | '30_DAYS' | '90_DAYS' | 'CUSTOM'

export type PlanHealthStatus =
  | 'ON_TRACK'
  | 'WATCH'
  | 'AT_RISK'
  | 'BLOCKED'
  | 'REPLAN_REQUIRED'
  | 'UNKNOWN'

export type PriorityBand = 'CRITICAL' | 'IMPORTANT' | 'WATCH' | 'INFORMATIONAL'

export type DependencyNode = {
  id: string
  kind: 'goal' | 'initiative' | 'task' | 'experiment' | 'content' | 'approval' | 'integration'
  label: string
  status: string
  blocked_by: string[]
  blocks: string[]
}

export type PriorityItem = {
  id: string
  title: string
  band: PriorityBand
  reasons: string[]
  funnel_id: string | null
}

export type LongHorizonPlan = StrategicPlanRecord & {
  time_horizon?: TimeHorizon | null
  health?: PlanHealthStatus | null
  health_breakdown?: Record<string, unknown>
  opportunity_ids?: string[]
  experiment_ids?: string[]
  required_resources?: unknown[]
  next_review_at?: string | null
  last_reviewed_at?: string | null
  horizon_start?: string | null
  horizon_end?: string | null
}

/** Deterministic priority — explained bands, not opaque scores. */
export function prioritizeItems(items: {
  id: string
  title: string
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  impact?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  blocks_initiative?: boolean
  deadline_hours?: number | null
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH'
  funnel_id?: string | null
}[]): PriorityItem[] {
  return items
    .map((it) => {
      const reasons: string[] = []
      let band: PriorityBand = 'INFORMATIONAL'
      if (it.urgency === 'CRITICAL' || it.impact === 'CRITICAL') {
        band = 'CRITICAL'
        reasons.push('Critical urgency or impact')
      } else if (it.blocks_initiative) {
        band = 'IMPORTANT'
        reasons.push('Blocks an active initiative')
      } else if (it.deadline_hours != null && it.deadline_hours <= 48) {
        band = 'IMPORTANT'
        reasons.push('Deadline approaching (≤48h)')
      } else if (it.urgency === 'HIGH' || it.impact === 'HIGH') {
        band = 'IMPORTANT'
        reasons.push('High urgency or impact')
      } else if (it.urgency === 'MEDIUM' || it.impact === 'MEDIUM') {
        band = 'WATCH'
        reasons.push('Medium priority — watch')
      } else {
        reasons.push('Informational only')
      }
      if (it.confidence === 'LOW') reasons.push('Low confidence — do not over-act')
      return {
        id: it.id,
        title: it.title,
        band,
        reasons,
        funnel_id: it.funnel_id ?? null,
      }
    })
    .sort((a, b) => {
      const order = { CRITICAL: 0, IMPORTANT: 1, WATCH: 2, INFORMATIONAL: 3 }
      return order[a.band] - order[b.band]
    })
}

export function assessPlanHealth(input: {
  status: string
  milestones: unknown[]
  dependencies: unknown[]
  risks: unknown[]
  goalStatuses: string[]
  openBlockers: number
  experimentsInconclusive: number
  metricAvailable: boolean
}): { health: PlanHealthStatus; breakdown: Record<string, unknown> } {
  if (!input.metricAvailable && input.goalStatuses.length === 0) {
    return {
      health: 'UNKNOWN',
      breakdown: { reason: 'Required metrics UNAVAILABLE — progress not fabricated.' },
    }
  }
  if (input.openBlockers > 0 || input.status === 'BLOCKED') {
    return {
      health: 'BLOCKED',
      breakdown: { open_blockers: input.openBlockers, note: 'Clear blockers before advancing.' },
    }
  }
  if (input.status === 'AT_RISK' || input.risks.length >= 2) {
    return {
      health: 'AT_RISK',
      breakdown: { risks: input.risks.length, note: 'Elevated risk — review assumptions.' },
    }
  }
  if (input.experimentsInconclusive > 0 && input.goalStatuses.includes('AT_RISK')) {
    return {
      health: 'REPLAN_REQUIRED',
      breakdown: { note: 'Inconclusive experiments + at-risk goals — propose replan (do not silent rewrite).' },
    }
  }
  const depsBlocked = (input.dependencies as { status?: string }[]).filter(
    (d) => d.status === 'blocked' || d.status === 'BLOCKED'
  ).length
  if (depsBlocked > 0) {
    return { health: 'WATCH', breakdown: { blocked_dependencies: depsBlocked } }
  }
  return {
    health: 'ON_TRACK',
    breakdown: {
      milestones: input.milestones.length,
      note: 'No fabricated progress — on-track means no blocking signals detected.',
    },
  }
}

export async function buildDependencyGraph(planId: string): Promise<{
  ok: boolean
  nodes: DependencyNode[]
  blockers: string[]
  note: string
}> {
  const plan = (await getStrategicPlan(planId)) as LongHorizonPlan | null
  if (!plan) return { ok: false, nodes: [], blockers: [], note: 'plan_not_found' }

  const nodes: DependencyNode[] = []
  const blockers: string[] = []

  for (const gid of plan.goal_ids || []) {
    nodes.push({
      id: gid,
      kind: 'goal',
      label: `Goal ${gid.slice(0, 8)}`,
      status: 'linked',
      blocked_by: [],
      blocks: [],
    })
  }

  for (const d of (plan.dependencies as { id?: string; label?: string; status?: string; kind?: string }[]) || []) {
    const status = d.status || 'unknown'
    nodes.push({
      id: d.id || `dep_${nodes.length}`,
      kind: (d.kind as DependencyNode['kind']) || 'initiative',
      label: d.label || 'Dependency',
      status,
      blocked_by: [],
      blocks: [],
    })
    if (/block/i.test(status)) blockers.push(d.label || d.id || 'dependency')
  }

  // Integration gates — always exposed honestly
  if (!liveMetaExecutionEnabled()) {
    nodes.push({
      id: 'integration_meta_live',
      kind: 'integration',
      label: 'Meta live execution',
      status: 'DISABLED',
      blocked_by: [],
      blocks: ['meta_write_actions'],
    })
    blockers.push('Meta live execution OFF — significant Meta writes remain prepare/approval only')
  }
  if (!liveInstagramPublishingEnabled()) {
    nodes.push({
      id: 'integration_ig_live',
      kind: 'integration',
      label: 'Instagram live publishing',
      status: 'DISABLED',
      blocked_by: [],
      blocks: ['instagram_publish'],
    })
    blockers.push('Instagram live publishing OFF')
  }

  return {
    ok: true,
    nodes,
    blockers,
    note: 'Dependencies are explicit. Disabled live flags are blockers for external writes — by design.',
  }
}

export async function reviewLongHorizonPlan(planId: string): Promise<Record<string, unknown>> {
  const plan = (await getStrategicPlan(planId)) as LongHorizonPlan | null
  if (!plan) return { ok: false, error: 'not_found' }

  const goals = await listGoals(50)
  const linked = goals.filter((g) => (plan.goal_ids || []).includes(g.id))
  const deps = await buildDependencyGraph(planId)
  const opps = await listOpportunities({
    status: ['DETECTED', 'SCORED', 'VALIDATED', 'PROPOSED', 'INVESTIGATING'],
    limit: 20,
  })
  const exps = await listExperiments(20)

  const health = assessPlanHealth({
    status: plan.status,
    milestones: Array.isArray(plan.milestones) ? plan.milestones : [],
    dependencies: Array.isArray(plan.dependencies) ? plan.dependencies : [],
    risks: Array.isArray(plan.risks) ? plan.risks : [],
    goalStatuses: linked.map((g) => g.status),
    openBlockers: deps.blockers.length,
    experimentsInconclusive: exps.filter((e) => e.status === 'inconclusive').length,
    metricAvailable: linked.some((g) => g.metric != null),
  })

  const admin = createAdminClient()
  await admin
    .from('jarvis_strategic_plans')
    .update({
      health: health.health,
      health_breakdown: health.breakdown,
      last_reviewed_at: new Date().toISOString(),
      next_review_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)

  return {
    ok: true,
    plan_id: planId,
    health: health.health,
    breakdown: health.breakdown,
    blockers: deps.blockers,
    goals: linked.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      funnel_id: g.funnel_id ?? 'UNCLASSIFIED',
    })),
    related_opportunities: opps.slice(0, 5).map((o) => ({ id: o.id, title: o.title, priority: o.priority })),
    related_experiments: exps.slice(0, 5).map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      sufficiency: e.data_sufficiency,
    })),
    note: 'Review only — no silent replan. Use strategy.replan_proposal / strategy.replan for changes.',
  }
}

export async function longHorizonReviewAll(): Promise<Record<string, unknown>> {
  const plans = (await listStrategicPlans(20)) as LongHorizonPlan[]
  const active = plans.filter((p) =>
    ['ACTIVE', 'PLANNED', 'AT_RISK', 'BLOCKED', 'PAUSED', 'REPLANNING'].includes(p.status)
  )
  const reviews = []
  for (const p of active.slice(0, 8)) {
    reviews.push(await reviewLongHorizonPlan(p.id))
  }
  return {
    ok: true,
    reviewed: reviews.length,
    reviews,
    note: 'Bounded long-horizon review — max 8 active plans per cycle.',
  }
}

export async function nextActionsForPlans(): Promise<Record<string, unknown>> {
  const plans = (await listStrategicPlans(15)) as LongHorizonPlan[]
  const opps = await listOpportunities({
    status: ['SCORED', 'VALIDATED', 'PROPOSED', 'INVESTIGATING'],
    limit: 15,
  })
  const priorities = prioritizeItems([
    ...plans
      .filter((p) => p.health === 'BLOCKED' || p.status === 'BLOCKED')
      .map((p) => ({
        id: p.id,
        title: `Unblock plan: ${p.name}`,
        urgency: 'HIGH' as const,
        impact: 'HIGH' as const,
        blocks_initiative: true,
        funnel_id: p.funnel_id,
      })),
    ...opps.map((o) => ({
      id: o.id,
      title: o.title,
      urgency: o.urgency === 'CRITICAL' ? ('CRITICAL' as const) : o.urgency === 'HIGH' ? ('HIGH' as const) : ('MEDIUM' as const),
      impact: o.priority === 'CRITICAL' ? ('CRITICAL' as const) : ('MEDIUM' as const),
      confidence: o.confidence === 'LOW' || o.confidence === 'VERY_LOW' ? ('LOW' as const) : ('MEDIUM' as const),
      funnel_id: o.funnel_id,
    })),
  ])

  return {
    ok: true,
    next_actions: priorities.slice(0, 12),
    note: 'Priorities are explained bands. Significant actions still require Phase 12 approval.',
  }
}

export async function attentionBudget(): Promise<Record<string, unknown>> {
  const next = await nextActionsForPlans()
  const items = (next.next_actions as PriorityItem[]) || []
  const critical = items.filter((i) => i.band === 'CRITICAL').slice(0, 3)
  const important = items.filter((i) => i.band === 'IMPORTANT').slice(0, 5)
  const watch = items.filter((i) => i.band === 'WATCH').slice(0, 3)
  return {
    ok: true,
    CRITICAL: critical,
    IMPORTANT: important,
    WATCH: watch,
    INFORMATIONAL_suppressed: Math.max(0, items.length - critical.length - important.length - watch.length),
    note: 'Attention budget — do not flood the operator. Deduped by band caps.',
  }
}

export async function replanProposal(planId: string): Promise<Record<string, unknown>> {
  const review = await reviewLongHorizonPlan(planId)
  if (!(review as { ok?: boolean }).ok) return review
  return {
    ok: true,
    proposal: {
      action: 'REPLAN_PROPOSAL',
      plan_id: planId,
      health: (review as { health?: string }).health,
      blockers: (review as { blockers?: string[] }).blockers,
      requires_approval: true,
      note: 'Proposal only — call strategy.replan to supersede. Never silent rewrite.',
    },
  }
}

export async function resumeLongHorizon(): Promise<Record<string, unknown>> {
  const plans = (await listStrategicPlans(20)) as LongHorizonPlan[]
  const resumable = plans.filter((p) =>
    ['ACTIVE', 'PAUSED', 'AT_RISK', 'BLOCKED', 'PLANNED'].includes(p.status)
  )
  return {
    ok: true,
    resumable: resumable.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      health: p.health ?? 'UNKNOWN',
      next_review_at: p.next_review_at ?? null,
      version: p.version,
    })),
    note: 'Durable resume from jarvis_strategic_plans — survives restart/absence.',
  }
}

export async function longHorizonHealth(): Promise<Record<string, unknown>> {
  const plans = (await listStrategicPlans(50)) as LongHorizonPlan[]
  const byHealth: Record<string, number> = {}
  for (const p of plans) {
    const h = p.health || 'UNKNOWN'
    byHealth[h] = (byHealth[h] || 0) + 1
  }
  return {
    plans: plans.length,
    by_health: byHealth,
    live_meta: liveMetaExecutionEnabled(),
    live_ig: liveInstagramPublishingEnabled(),
    note: 'Phase 21 long-horizon health.',
  }
}
