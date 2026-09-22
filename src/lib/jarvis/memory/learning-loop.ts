/**
 * Phase 3 learning loop — decision → action → schedule → measure → compare → learn.
 * Stages are independently testable. No causality overclaims.
 */

import { remember } from '@/lib/jarvis/memory/business-memory'
import { validateMemoryWrite } from '@/lib/jarvis/memory/kinds'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  recordDecision,
  linkActionToDecision,
  listRecentDecisions,
  listDecisionsAwaitingMeasurement,
  type DecisionRecord,
} from '@/lib/jarvis/memory/decisions'
import {
  scheduleOutcomeCheck,
  measureOutcome,
  processDueOutcomeMeasurements,
  measurementKey,
} from '@/lib/jarvis/memory/outcomes'
import {
  extractExplicitPreference,
  isVagueComplaint,
  storeExplicitPreference,
  listPreferenceConfirmationCandidates,
  listMemoryReviewItems,
  markStaleMemories,
} from '@/lib/jarvis/memory/preferences'
import { compareMetric, classifyOutcome } from '@/lib/jarvis/memory/comparison'
import {
  observationalStatement,
  patternStrength,
  type MeasurementWindowHours,
  type MemoryScope,
} from '@/lib/jarvis/memory/scopes'
import type { MetricExpectation } from '@/lib/jarvis/memory/comparison'

export {
  recordDecision,
  linkActionToDecision,
  scheduleOutcomeCheck,
  measureOutcome,
  processDueOutcomeMeasurements,
  measurementKey,
  compareMetric,
  classifyOutcome,
  observationalStatement,
  patternStrength,
}

export type OutcomeRecordInput = {
  decision: string
  actionSummary: string
  tools: string[]
  taskId?: string | null
  conversationId?: string | null
  actorId?: string | null
  measured?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    window?: string
  }
  success: boolean
  partialFailure?: string | null
  evidence: string[]
}

/**
 * Lightweight outcome record (Phase 1 compat) — observational language only.
 */
export async function recordOutcome(input: OutcomeRecordInput) {
  const validation = validateMemoryWrite({
    kind: 'OUTCOME',
    source: 'jarvis.outcome',
    evidence: input.evidence,
    summary: input.actionSummary,
  })
  if (!validation.ok) {
    return { ok: false as const, error: validation.error }
  }

  const summaryParts = [
    input.success ? 'Action completed.' : 'Action did not fully succeed.',
    input.actionSummary.slice(0, 400),
  ]
  if (input.partialFailure) {
    summaryParts.push(`Partial failure: ${input.partialFailure.slice(0, 200)}`)
  }
  if (input.measured?.before || input.measured?.after) {
    summaryParts.push(
      `Observed metrics (${input.measured.window || 'window not specified'}) recorded for comparison — association only, not proven causation.`
    )
  }

  const row = await remember({
    category: 'outcome',
    kind: 'OUTCOME',
    title: `Outcome: ${input.decision.slice(0, 80)}`,
    summary: summaryParts.join(' ').slice(0, 2000),
    confidence: input.success ? 'medium' : 'low',
    tags: ['outcome_record', 'outcome', ...(input.tools.slice(0, 5))],
    source: 'jarvis.outcome',
    actorId: input.actorId,
    evidence: input.evidence,
    details: {
      memory_kind: 'OUTCOME',
      record_type: 'OUTCOME',
      decision: input.decision,
      tools: input.tools,
      task_id: input.taskId ?? null,
      conversation_id: input.conversationId ?? null,
      measured: input.measured ?? null,
      evidence: input.evidence,
      causal_language: 'observational_only',
      success: input.success,
      partial_failure: input.partialFailure ?? null,
    },
  })

  return { ok: true as const, memory: row }
}

/**
 * Full Phase 3 path for a significant measurable action.
 */
export async function recordDecisionActionAndSchedule(input: {
  objective: string
  system: string
  scope?: MemoryScope
  scopeId?: string | null
  reason: string
  evidence?: string[]
  expectedOutcome: { metrics: MetricExpectation[]; qualitative?: string }
  baseline: Record<string, unknown>
  baselineSource: string
  measurementWindowHours?: MeasurementWindowHours
  successCriteria?: Record<string, unknown>
  risk?: 'low' | 'medium' | 'high' | 'critical'
  approvalRequired?: boolean
  approvalStatus?: string
  source?: 'JARVIS' | 'USER_DIRECTED' | 'SYSTEM_AUTOMATION'
  toolName?: string | null
  actionInput?: Record<string, unknown>
  actionStatus?:
    | 'planned'
    | 'waiting_for_approval'
    | 'approved'
    | 'executed'
    | 'verified'
    | 'failed'
    | 'blocked'
    | 'cancelled'
    | 'recorded_not_executed'
  actionResult?: Record<string, unknown>
  verificationState?: string | null
  relatedApprovalId?: string | null
  relatedTaskId?: string | null
  relatedToolCallId?: string | null
  actorId?: string | null
  scheduleMeasurement?: boolean
  dueAt?: Date
}): Promise<{
  ok: boolean
  decision?: DecisionRecord
  measurementId?: string
  error?: string
}> {
  const decisionResult = await recordDecision({
    objective: input.objective,
    system: input.system,
    scope: input.scope,
    scopeId: input.scopeId,
    reason: input.reason,
    evidence: input.evidence,
    expectedOutcome: input.expectedOutcome,
    baseline: input.baseline,
    baselineSource: input.baselineSource,
    measurementWindowHours: input.measurementWindowHours,
    successCriteria: input.successCriteria,
    risk: input.risk,
    approvalRequired: input.approvalRequired,
    approvalStatus: input.approvalStatus,
    source: input.source,
    toolName: input.toolName,
    actionInput: input.actionInput,
    relatedApprovalId: input.relatedApprovalId,
    relatedTaskId: input.relatedTaskId,
    relatedToolCallId: input.relatedToolCallId,
    actorId: input.actorId,
  })
  if (!decisionResult.ok) return { ok: false, error: decisionResult.error }

  const status = input.actionStatus ?? 'planned'
  if (status !== 'planned') {
    await linkActionToDecision({
      decisionId: decisionResult.decision.id,
      actionStatus: status,
      actionResult: input.actionResult,
      verificationState: input.verificationState,
      relatedToolCallId: input.relatedToolCallId,
      relatedApprovalId: input.relatedApprovalId,
    })
  }

  // Mirror ACTION memory when executed/verified
  if (status === 'executed' || status === 'verified') {
    await remember({
      category: 'decision',
      kind: 'ACTION',
      title: `Action: ${input.objective.slice(0, 80)}`,
      summary: `${input.toolName || 'action'} — ${status}. Linked to decision ${decisionResult.decision.id}.`,
      source: 'jarvis.learning_loop',
      confidence: 'medium',
      tags: ['action', input.system],
      evidence: [`decision:${decisionResult.decision.id}`, ...(input.evidence ?? [])],
      actorId: input.actorId,
      scope: input.scope,
      scopeId: input.scopeId,
      details: {
        memory_kind: 'ACTION',
        record_type: 'ACTION',
        decision_id: decisionResult.decision.id,
        tool_name: input.toolName,
        action_status: status,
      },
    }).catch(() => null)
  }

  let measurementId: string | undefined
  const shouldSchedule =
    input.scheduleMeasurement !== false &&
    (status === 'executed' || status === 'verified' || status === 'approved')

  if (shouldSchedule) {
    const sched = await scheduleOutcomeCheck({
      decisionId: decisionResult.decision.id,
      windowHours: input.measurementWindowHours,
      dueAt: input.dueAt,
    })
    if (sched.ok) measurementId = sched.measurementId
  }

  return { ok: true, decision: decisionResult.decision, measurementId }
}

/**
 * After a chat turn with executed tools, store a light outcome when justified.
 * Preferences/decisions from explicit user phrasing can also be stored.
 */
export async function learnFromChatTurn(input: {
  userMessage: string
  thinkingSummary: string
  toolResults: { tool: string; status: string; summary: string }[]
  approvals: unknown[]
  taskId: string
  conversationId: string
  actorId: string
}): Promise<{ learned: boolean; kind?: string; id?: string }> {
  // Explicit preference / operating rule
  if (!isVagueComplaint(input.userMessage)) {
    const pref = extractExplicitPreference(input.userMessage)
    if (pref) {
      const stored = await storeExplicitPreference({
        statement: pref.statement,
        kind: pref.kind,
        scope: pref.scope,
        actorId: input.actorId,
      })
      if (stored.ok) {
        return { learned: true, kind: pref.kind, id: stored.id }
      }
    }
  }

  const executed = input.toolResults.filter(
    (t) => t.status === 'executed' || t.status === 'requires_approval'
  )
  if (!executed.length) return { learned: false }

  const evidence = executed.map((t) => `${t.tool}: ${t.summary}`.slice(0, 200))
  const decision =
    input.approvals.length > 0
      ? `Requested approval for ${input.approvals.length} significant action(s)`
      : `Executed ${executed.length} tool step(s)`

  const result = await recordOutcome({
    decision,
    actionSummary: input.thinkingSummary || decision,
    tools: executed.map((t) => t.tool),
    taskId: input.taskId,
    conversationId: input.conversationId,
    actorId: input.actorId,
    success: executed.every((t) => t.status === 'executed' || t.status === 'requires_approval'),
    partialFailure: executed.some((t) => t.status === 'failed')
      ? 'One or more tool steps failed'
      : null,
    evidence,
  })

  if (!result.ok) return { learned: false }
  return { learned: true, kind: 'OUTCOME', id: result.memory?.id }
}

/** Recent learnings for Command Center. */
export async function listRecentLearnings(limit = 8) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_memory')
    .select('id, category, title, summary, confidence, created_at, details, source, scope, memory_status, sample_size, evidence_label')
    .in('category', ['outcome', 'insight', 'decision', 'preference'])
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getLearningCenterData() {
  const admin = createAdminClient()
  const [
    lessons,
    decisions,
    outcomes,
    preferences,
    hypotheses,
    review,
    awaiting,
    patterns,
    confirmations,
  ] = await Promise.all([
    admin
      .from('jarvis_memory')
      .select('id, title, summary, confidence, scope, scope_id, sample_size, evidence_label, created_at, details, source')
      .eq('category', 'outcome')
      .contains('tags', ['lesson'])
      .eq('memory_status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(15),
    listRecentDecisions(15),
    admin
      .from('jarvis_outcome_measurements')
      .select(
        'id, decision_id, status, due_at, measured_at, outcome_state, evidence_label, comparison, actual, expected, jarvis_decisions(objective, baseline, expected_outcome, measurement_window_hours, system, scope)'
      )
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('jarvis_memory')
      .select('id, title, summary, confidence, scope, created_at, source, memory_status')
      .eq('category', 'preference')
      .eq('memory_status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('jarvis_memory')
      .select('id, title, summary, confidence, scope, created_at, source, sample_size')
      .eq('category', 'insight')
      .eq('memory_status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(15),
    listMemoryReviewItems(20),
    listDecisionsAwaitingMeasurement(15),
    admin
      .from('jarvis_memory')
      .select('id, title, summary, confidence, sample_size, evidence_label, created_at')
      .contains('tags', ['repeated_pattern'])
      .eq('memory_status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(10),
    listPreferenceConfirmationCandidates(5),
  ])

  return {
    recent_lessons: lessons.data ?? [],
    decisions,
    outcomes: outcomes.data ?? [],
    patterns: (patterns.data ?? []) as unknown[],
    preferences: preferences.data ?? [],
    hypotheses: hypotheses.data ?? [],
    memory_review: review,
    awaiting_measurement: awaiting,
    preference_confirmations: confirmations,
    taste: await (async () => {
      try {
        const { getTasteProfile } = await import('@/lib/jarvis/taste')
        return await getTasteProfile()
      } catch {
        return null
      }
    })(),
  }
}

/**
 * Natural-language learning queries against stored records.
 */
export async function answerLearningQuery(query: string): Promise<{
  kind: string
  answer: string
  items: Record<string, unknown>[]
}> {
  const q = query.toLowerCase().trim()
  const center = await getLearningCenterData()

  if (/preferenc/.test(q) || /what do you know about me/.test(q)) {
    return {
      kind: 'preferences',
      answer:
        center.preferences.length > 0
          ? `I have ${center.preferences.length} active preference(s) stored from explicit instructions.`
          : 'No explicit preferences stored yet.',
      items: center.preferences as Record<string, unknown>[],
    }
  }

  if (/stale/.test(q) || /memory review|conflicting/.test(q)) {
    return {
      kind: 'review',
      answer: `${center.memory_review.length} memory review item(s) (stale, superseded, or low confidence).`,
      items: center.memory_review as Record<string, unknown>[],
    }
  }

  if (/waiting|awaiting|measurement/.test(q) && /decision|outcome|measur/.test(q)) {
    return {
      kind: 'awaiting',
      answer: `${center.awaiting_measurement.length} decision(s) awaiting measurement.`,
      items: center.awaiting_measurement as Record<string, unknown>[],
    }
  }

  if (/inconclusive/.test(q)) {
    const items = (center.outcomes as { outcome_state?: string }[]).filter(
      (o) => o.outcome_state === 'INCONCLUSIVE'
    )
    return {
      kind: 'inconclusive',
      answer: `${items.length} inconclusive outcome(s).`,
      items: items as Record<string, unknown>[],
    }
  }

  if (/hypothes|assum|uncertain/.test(q)) {
    return {
      kind: 'hypotheses',
      answer: `${center.hypotheses.length} active hypothesis/ies (not proven).`,
      items: center.hypotheses as Record<string, unknown>[],
    }
  }

  if (/high.?confidence|strong.?lesson/.test(q)) {
    const items = (center.recent_lessons as { confidence?: string }[]).filter(
      (l) => l.confidence === 'high' || l.confidence === 'medium'
    )
    return {
      kind: 'high_confidence',
      answer: `${items.length} lesson(s) with medium/high confidence.`,
      items: items as Record<string, unknown>[],
    }
  }

  if (/didn't work|underperform|failed|worse/.test(q)) {
    const items = (center.outcomes as { outcome_state?: string }[]).filter((o) =>
      ['UNDERPERFORMED', 'FAILED_ACTION'].includes(String(o.outcome_state))
    )
    return {
      kind: 'underperformed',
      answer: `${items.length} underperformed/failed outcome(s).`,
      items: items as Record<string, unknown>[],
    }
  }

  if (/worked|success/.test(q) && /decision|outcome|what/.test(q)) {
    const items = (center.outcomes as { outcome_state?: string }[]).filter(
      (o) => o.outcome_state === 'SUCCESS' || o.outcome_state === 'PARTIAL_SUCCESS'
    )
    return {
      kind: 'success',
      answer: `${items.length} successful/partial outcome(s).`,
      items: items as Record<string, unknown>[],
    }
  }

  if (/yesterday|this week|recently|learned|what have you learned|₹99|funnel/.test(q)) {
    const days = /yesterday/.test(q) ? 1 : /week/.test(q) ? 7 : 14
    const cutoff = Date.now() - days * 86400_000
    let items = (center.recent_lessons as { created_at?: string; summary?: string; title?: string }[]).filter(
      (l) => l.created_at && new Date(l.created_at).getTime() >= cutoff
    )
    if (/₹99|99/.test(q)) {
      items = items.filter(
        (l) => /99|funnel/i.test(`${l.title} ${l.summary}`)
      )
    }
    return {
      kind: 'recent_lessons',
      answer:
        items.length > 0
          ? `Learned ${items.length} lesson(s) in the selected window (observational, not causal).`
          : 'No lessons stored in that window yet.',
      items: items as Record<string, unknown>[],
    }
  }

  if (/budget change|last (budget|campaign|action)/.test(q)) {
    const last = center.decisions[0]
    const related = (center.outcomes as { decision_id?: string }[]).filter(
      (o) => last && o.decision_id === last.id
    )
    return {
      kind: 'last_decision',
      answer: last
        ? `Last decision: ${last.objective}. ${related.length} linked measurement(s).`
        : 'No decisions recorded yet.',
      items: [last, ...related].filter(Boolean) as Record<string, unknown>[],
    }
  }

  return {
    kind: 'overview',
    answer: `Learning center: ${center.recent_lessons.length} lessons, ${center.decisions.length} decisions, ${center.outcomes.length} outcomes, ${center.preferences.length} preferences.`,
    items: [
      ...(center.recent_lessons.slice(0, 3) as Record<string, unknown>[]),
      ...(center.decisions.slice(0, 2) as unknown as Record<string, unknown>[]),
    ],
  }
}

/** Background learning maintenance (bounded). */
export async function runLearningMaintenance(opts?: {
  maxOutcomeChecks?: number
  maxStaleMarks?: number
}): Promise<{
  outcomes: { processed: number; skipped: number; errors: string[] }
  stale: { marked: number }
  paused_budget?: boolean
}> {
  const outcomes = await processDueOutcomeMeasurements({
    maxChecks: opts?.maxOutcomeChecks ?? 5,
  })
  const paused =
    outcomes.errors.some((e) => /budget|PAUSED/i.test(e)) && outcomes.processed === 0
  const stale = await markStaleMemories({ maxWrites: opts?.maxStaleMarks ?? 10 })
  return { outcomes, stale, paused_budget: paused || undefined }
}
