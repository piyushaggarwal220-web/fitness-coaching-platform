import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAutonomyLevel,
  getGuardrails,
} from '@/lib/ai-marketing/settings'
import { evaluateAutonomyGate } from '@/lib/ai-marketing/autonomy'
import { runGuardrails } from '@/lib/ai-marketing/guardrails'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { executeMetaWrite, pushCreativeToMeta } from '@/lib/ai-marketing/meta/writes'
import type { AnalyticsFinding, StructuredDecision } from '@/lib/ai-marketing/types'
import { randomUUID } from 'crypto'

export async function proposeActionsFromFindings(
  findings: AnalyticsFinding[],
  opts?: {
    actorId?: string | null
    inputSummary?: Record<string, unknown>
    funnelId?: string | null
  }
): Promise<string[]> {
  const admin = createAdminClient()
  const autonomy = await getAutonomyLevel()
  const guardrails = await getGuardrails()
  const ids: string[] = []

  for (const finding of findings) {
    const gate = evaluateAutonomyGate({
      level: autonomy,
      action: finding.recommended_action,
      risk: finding.risk_level,
    })

    const { data: decision, error } = await admin
      .from('marketing_ai_decisions')
      .insert({
        agent: 'analytics',
        entity_type: finding.entity_type ?? null,
        entity_id: finding.entity_id ?? null,
        funnel_id: opts?.funnelId ?? null,
        decision: finding.issue,
        reasoning: finding.recommendation,
        evidence: finding.evidence,
        confidence: finding.confidence,
        recommended_action: finding.recommended_action,
        risk_level: finding.risk_level,
        estimated_impact: finding.estimated_impact_category,
        autonomy_level: autonomy,
        status: gate.allowed ? 'pending' : 'cancelled',
        input_summary: {
          ...(opts?.inputSummary ?? {}),
          evidence_strength: finding.evidence_strength,
          caveats: finding.caveats,
          gate,
        },
        raw_output: finding,
      })
      .select('id')
      .maybeSingle()

    if (error || !decision) continue
    ids.push(decision.id)

    if (!gate.allowed || gate.mode === 'record_only') {
      await writeMarketingAudit({
        agent: 'decision_engine',
        decision: finding.issue,
        reasoning: gate.allowed
          ? 'Recorded recommendation only (autonomy level 1)'
          : gate.reason,
        confidence: finding.confidence,
        action: finding.recommended_action,
        autonomy_level: autonomy,
        approval: 'n/a',
        related_decision_id: decision.id,
        actor_id: opts?.actorId ?? null,
      })
      continue
    }

    const g = runGuardrails({
      action: finding.recommended_action,
      risk: finding.risk_level,
      settings: guardrails,
    })

    const idempotencyKey = `decision:${decision.id}:${finding.recommended_action}`
    const approvalStatus = g.passed
      ? gate.mode === 'auto_execute'
        ? 'auto_approved'
        : 'pending'
      : 'blocked'

    const { data: action } = await admin
      .from('marketing_ai_actions')
      .upsert(
        {
          decision_id: decision.id,
          funnel_id: opts?.funnelId ?? null,
          action_type: finding.recommended_action,
          target_type: finding.entity_type ?? null,
          target_id: finding.entity_id ?? null,
          parameters: {
            issue: finding.issue,
            evidence: finding.evidence,
            caveats: finding.caveats,
            funnel_id: opts?.funnelId ?? null,
          },
          approval_status: approvalStatus,
          autonomy_level: autonomy,
          idempotency_key: idempotencyKey,
          risk_level: finding.risk_level,
          guardrail_result: g,
          created_by: opts?.actorId ?? null,
        },
        { onConflict: 'idempotency_key' }
      )
      .select('id')
      .maybeSingle()

    await writeMarketingAudit({
      agent: 'decision_engine',
      decision: finding.issue,
      reasoning: finding.recommendation,
      confidence: finding.confidence,
      action: finding.recommended_action,
      autonomy_level: autonomy,
      approval: approvalStatus,
      related_decision_id: decision.id,
      related_action_id: action?.id ?? null,
      execution_result: { guardrails: g, gate, funnel_id: opts?.funnelId },
      actor_id: opts?.actorId ?? null,
    })
  }

  return ids
}

export async function proposeStructuredDecisions(
  decisions: StructuredDecision[],
  opts?: { agent?: string; actorId?: string | null }
): Promise<string[]> {
  const findings: AnalyticsFinding[] = decisions.map((d) => ({
    issue: d.decision,
    evidence: d.evidence,
    evidence_strength: d.confidence >= 0.75 ? 'strong_evidence' : 'possible_issue',
    recommendation: d.reason,
    recommended_action: d.recommended_action,
    confidence: d.confidence,
    estimated_impact_category: 'medium',
    risk_level: d.risk_level,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    requires_human_approval: true,
    caveats: ['Structured decision from Marketing Brain'],
  }))
  return proposeActionsFromFindings(findings, {
    actorId: opts?.actorId ?? null,
    inputSummary: { agent: opts?.agent ?? 'brain' },
  })
}

export async function approveMarketingAction(params: {
  actionId: string
  actorId: string
  approve: boolean
}): Promise<{ ok: boolean; error?: string; execution?: Record<string, unknown> }> {
  const admin = createAdminClient()
  const { data: action, error } = await admin
    .from('marketing_ai_actions')
    .select('*')
    .eq('id', params.actionId)
    .maybeSingle()

  if (error || !action) return { ok: false, error: 'Action not found' }
  if (action.approval_status !== 'pending' && action.approval_status !== 'auto_approved') {
    return { ok: false, error: `Action is already ${action.approval_status}` }
  }

  if (!params.approve) {
    await admin
      .from('marketing_ai_actions')
      .update({
        approval_status: 'rejected',
        approved_by: params.actorId,
      })
      .eq('id', params.actionId)

    if (action.decision_id) {
      await admin
        .from('marketing_ai_decisions')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString(),
          resolved_by: params.actorId,
        })
        .eq('id', action.decision_id)
    }

    await writeMarketingAudit({
      agent: 'approval',
      decision: 'rejected',
      action: action.action_type,
      approval: 'rejected',
      related_action_id: action.id,
      related_decision_id: action.decision_id,
      actor_id: params.actorId,
    })
    return { ok: true, execution: { status: 'rejected' } }
  }

  // Re-check guardrails at approval time
  const guardrails = await getGuardrails()
  const g = runGuardrails({
    action: action.action_type,
    risk: action.risk_level,
    settings: guardrails,
    currentBudget:
      typeof action.parameters?.current_budget === 'number'
        ? action.parameters.current_budget
        : null,
    proposedBudget:
      typeof action.parameters?.proposed_budget === 'number'
        ? action.parameters.proposed_budget
        : null,
  })

  if (!g.passed) {
    await admin
      .from('marketing_ai_actions')
      .update({
        approval_status: 'blocked',
        guardrail_result: g,
        error: g.blockedReasons.join('; '),
      })
      .eq('id', params.actionId)
    return { ok: false, error: g.blockedReasons.join('; ') }
  }

  await admin
    .from('marketing_ai_actions')
    .update({
      approval_status: 'approved',
      approved_by: params.actorId,
      guardrail_result: g,
    })
    .eq('id', params.actionId)

  let execution: Record<string, unknown> = {
    status: 'approved_recorded',
    note: 'Approval recorded. ACTIVE Meta spend/activation still requires LIVE_META_EXECUTION_ENABLED=true. PAUSED creative/test creation can run when credentials exist.',
  }

  const metaActions = new Set([
    'PAUSE_AD',
    'RESUME_AD',
    'INCREASE_BUDGET',
    'DECREASE_BUDGET',
    'UPDATE_AD',
    'UPDATE_ADSET',
    'UPDATE_CAMPAIGN',
  ])

  if (metaActions.has(action.action_type) && action.target_id) {
    const write = await executeMetaWrite({
      action: action.action_type as
        | 'PAUSE_AD'
        | 'RESUME_AD'
        | 'INCREASE_BUDGET'
        | 'DECREASE_BUDGET'
        | 'UPDATE_AD'
        | 'UPDATE_ADSET'
        | 'UPDATE_CAMPAIGN',
      targetMetaId: action.target_id,
      parameters: {
        ...((action.parameters as Record<string, unknown>) ?? {}),
        ...g.normalizedParameters,
      },
      idempotencyKey: action.idempotency_key || `approve:${action.id}:${randomUUID()}`,
    })
    execution = {
      ...execution,
      meta: write,
    }
  }

  // Explicit approved creative → Meta ad creative (PAUSED usage), idempotent
  if (
    (action.action_type === 'CREATE_CREATIVE' || action.action_type === 'CREATE_NEW_CREATIVE') &&
    typeof (action.parameters as Record<string, unknown> | null)?.creative_id === 'string'
  ) {
    const push = await pushCreativeToMeta({
      creativeId: String((action.parameters as Record<string, unknown>).creative_id),
      actorId: params.actorId,
    })
    execution = { ...execution, meta_creative_push: push }
  }

  await admin
    .from('marketing_ai_actions')
    .update({
      executed_at: new Date().toISOString(),
      execution_result: execution,
      error: typeof execution.meta === 'object' && execution.meta && 'error' in execution.meta
        ? String((execution.meta as { error?: string }).error ?? '')
        : null,
    })
    .eq('id', params.actionId)

  if (action.decision_id) {
    await admin
      .from('marketing_ai_decisions')
      .update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        resolved_by: params.actorId,
      })
      .eq('id', action.decision_id)
  }

  await writeMarketingAudit({
    agent: 'approval',
    decision: 'approved',
    action: action.action_type,
    approval: 'approved',
    related_action_id: action.id,
    related_decision_id: action.decision_id,
    actor_id: params.actorId,
    execution_result: execution,
  })

  return { ok: true, execution }
}
