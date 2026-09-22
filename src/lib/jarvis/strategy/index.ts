/**
 * Phase 16 — Goals & strategic plans (durable direction).
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type GoalType =
  | 'REVENUE'
  | 'PROFIT'
  | 'CUSTOMER_ACQUISITION'
  | 'CPA'
  | 'ROAS'
  | 'CONTENT'
  | 'AUDIENCE'
  | 'PRODUCT'
  | 'OPERATIONS'
  | 'SYSTEM_RELIABILITY'
  | 'EXPERIMENTATION'
  | 'CUSTOM'

export type GoalStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'ACHIEVED'
  | 'MISSED'
  | 'PAUSED'
  | 'CANCELLED'
  | 'SUPERSEDED'

export type GoalRecord = {
  id: string
  name: string
  description: string | null
  type: GoalType
  scope: string
  funnel_id: string | null
  metric: string | null
  baseline: Record<string, unknown>
  target: Record<string, unknown>
  unit: string | null
  start_date: string | null
  target_date: string | null
  status: GoalStatus
  priority: string
  owner: string | null
  constraints: unknown[]
  assumptions: unknown[]
  progress: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type StrategicPlanRecord = {
  id: string
  name: string
  objective: string
  status: string
  goal_ids: string[]
  milestones: unknown[]
  initiatives: unknown[]
  dependencies: unknown[]
  constraints: unknown[]
  risks: unknown[]
  assumptions: unknown[]
  success_criteria: unknown[]
  funnel_id: string | null
  version: number
  supersedes_id: string | null
  replan_reason: string | null
  created_at: string
  updated_at: string
}

export async function createGoal(input: {
  name: string
  description?: string
  type: GoalType
  scope?: string
  funnel_id?: string | null
  metric?: string
  baseline?: Record<string, unknown>
  target?: Record<string, unknown>
  unit?: string
  start_date?: string
  target_date?: string
  priority?: string
  owner?: string
  constraints?: unknown[]
  assumptions?: unknown[]
  actorId?: string | null
}): Promise<{ ok: boolean; goal?: GoalRecord; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_goals')
    .insert({
      name: input.name.slice(0, 200),
      description: input.description?.slice(0, 2000) ?? null,
      type: input.type,
      scope: input.scope ?? 'GLOBAL_BUSINESS',
      funnel_id: input.funnel_id ?? null,
      metric: input.metric ?? null,
      baseline: input.baseline ?? {},
      target: input.target ?? {},
      unit: input.unit ?? null,
      start_date: input.start_date ?? null,
      target_date: input.target_date ?? null,
      priority: input.priority ?? 'MEDIUM',
      owner: input.owner ?? null,
      constraints: input.constraints ?? [],
      assumptions: input.assumptions ?? [],
      created_by: input.actorId ?? null,
      status: 'ACTIVE',
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, goal: data as GoalRecord }
}

export async function listGoals(limit = 30): Promise<GoalRecord[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_goals')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as GoalRecord[]
}

export async function getGoal(id: string): Promise<GoalRecord | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_goals').select('*').eq('id', id).maybeSingle()
  return (data as GoalRecord) ?? null
}

export async function createStrategicPlan(input: {
  name: string
  objective: string
  goal_ids?: string[]
  milestones?: unknown[]
  initiatives?: unknown[]
  dependencies?: unknown[]
  constraints?: unknown[]
  risks?: unknown[]
  assumptions?: unknown[]
  success_criteria?: unknown[]
  funnel_id?: string | null
  actorId?: string | null
}): Promise<{ ok: boolean; plan?: StrategicPlanRecord; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_strategic_plans')
    .insert({
      name: input.name.slice(0, 200),
      objective: input.objective.slice(0, 2000),
      goal_ids: input.goal_ids ?? [],
      milestones: input.milestones ?? [],
      initiatives: input.initiatives ?? [],
      dependencies: input.dependencies ?? [],
      constraints: input.constraints ?? [],
      risks: input.risks ?? [],
      assumptions: input.assumptions ?? [],
      success_criteria: input.success_criteria ?? [],
      funnel_id: input.funnel_id ?? null,
      created_by: input.actorId ?? null,
      status: 'ACTIVE',
      version: 1,
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, plan: data as StrategicPlanRecord }
}

export async function getStrategicPlan(id: string): Promise<StrategicPlanRecord | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_strategic_plans').select('*').eq('id', id).maybeSingle()
  return (data as StrategicPlanRecord) ?? null
}

export async function listStrategicPlans(limit = 20): Promise<StrategicPlanRecord[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_strategic_plans')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as StrategicPlanRecord[]
}

/**
 * Replan: supersede prior plan with new version — never silent rewrite.
 */
export async function replanStrategic(input: {
  planId: string
  reason: string
  previous_assumption: string
  new_evidence: string
  proposed_objective?: string
  actorId?: string | null
}): Promise<{ ok: boolean; plan?: StrategicPlanRecord; requires_approval: boolean; error?: string }> {
  const prior = await getStrategicPlan(input.planId)
  if (!prior) return { ok: false, requires_approval: false, error: 'not_found' }

  const admin = createAdminClient()
  await admin
    .from('jarvis_strategic_plans')
    .update({ status: 'SUPERSEDED', updated_at: new Date().toISOString() })
    .eq('id', input.planId)

  const { data, error } = await admin
    .from('jarvis_strategic_plans')
    .insert({
      name: prior.name,
      objective: (input.proposed_objective || prior.objective).slice(0, 2000),
      goal_ids: prior.goal_ids,
      milestones: prior.milestones,
      initiatives: prior.initiatives,
      dependencies: prior.dependencies,
      constraints: prior.constraints,
      risks: [
        ...(Array.isArray(prior.risks) ? prior.risks : []),
        {
          type: 'REPLAN',
          previous_assumption: input.previous_assumption,
          new_evidence: input.new_evidence,
          reason: input.reason,
        },
      ],
      assumptions: prior.assumptions,
      success_criteria: prior.success_criteria,
      funnel_id: prior.funnel_id,
      version: (prior.version || 1) + 1,
      supersedes_id: prior.id,
      replan_reason: input.reason,
      status: 'ACTIVE',
      created_by: input.actorId ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, requires_approval: true, error: error.message }
  return {
    ok: true,
    plan: data as StrategicPlanRecord,
    requires_approval: true,
    error: undefined,
  }
}

export async function strategyReview(): Promise<Record<string, unknown>> {
  const [goals, plans] = await Promise.all([listGoals(20), listStrategicPlans(10)])
  return {
    ok: true,
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      status: g.status,
      funnel_id: g.funnel_id ?? 'UNCLASSIFIED',
      target: g.target,
    })),
    at_risk: goals.filter((g) => g.status === 'AT_RISK'),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      version: p.version,
      objective: p.objective.slice(0, 200),
    })),
    note: 'Strategy review — significant replans require approval. Phase 12 authoritative for actions.',
  }
}

export async function strategyHealth(): Promise<Record<string, unknown>> {
  const goals = await listGoals(100)
  const plans = await listStrategicPlans(50)
  return {
    goals_total: goals.length,
    goals_active: goals.filter((g) => g.status === 'ACTIVE').length,
    goals_at_risk: goals.filter((g) => g.status === 'AT_RISK').length,
    plans_active: plans.filter((p) => p.status === 'ACTIVE').length,
    note: 'Phase 16 strategy health.',
  }
}

export function explainGoal(goal: GoalRecord): Record<string, unknown> {
  return {
    OBSERVED: [`Goal "${goal.name}" status=${goal.status}`],
    TARGET: goal.target,
    BASELINE: goal.baseline,
    ASSUMPTIONS: goal.assumptions,
    CONSTRAINTS: goal.constraints,
    funnel_id: goal.funnel_id ?? 'UNCLASSIFIED',
    note: 'Progress not auto-invented — update via measurement tools.',
  }
}
