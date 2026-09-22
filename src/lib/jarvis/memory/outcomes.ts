/**
 * Outcome engine — schedule, measure, compare, evaluate lessons.
 * Idempotent. No causality claims. Uses existing facades for fresh data.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getDecision, type DecisionRecord } from '@/lib/jarvis/memory/decisions'
import {
  classifyOutcome,
  compareMetric,
  type MetricComparison,
  type MetricExpectation,
} from '@/lib/jarvis/memory/comparison'
import {
  observationalStatement,
  patternStrength,
  type EvidenceLabel,
  type MeasurementWindowHours,
  type OutcomeState,
} from '@/lib/jarvis/memory/scopes'
import { remember } from '@/lib/jarvis/memory/business-memory'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'

export function measurementKey(decisionId: string, windowHours: number): string {
  return `${decisionId}:${windowHours}h`
}

export async function scheduleOutcomeCheck(input: {
  decisionId: string
  windowHours?: MeasurementWindowHours
  dueAt?: Date
}): Promise<{ ok: true; measurementId: string; created: boolean } | { ok: false; error: string }> {
  const decision = await getDecision(input.decisionId)
  if (!decision) return { ok: false, error: 'Decision not found' }

  const hours = (input.windowHours ?? decision.measurement_window_hours ?? 48) as MeasurementWindowHours
  const key = measurementKey(input.decisionId, hours)
  const dueAt =
    input.dueAt ??
    new Date(Date.now() + hours * 3600_000)

  const admin = createAdminClient()

  // Idempotent upsert on measurement_key
  const { data: existing } = await admin
    .from('jarvis_outcome_measurements')
    .select('id')
    .eq('measurement_key', key)
    .maybeSingle()

  if (existing?.id) {
    return { ok: true, measurementId: existing.id, created: false }
  }

  const { data: job } = await admin
    .from('jarvis_background_jobs')
    .insert({
      job_type: 'outcome_measurement',
      status: 'queued',
      payload: { decision_id: input.decisionId, measurement_key: key, due_at: dueAt.toISOString() },
    })
    .select('id')
    .maybeSingle()

  const { data, error } = await admin
    .from('jarvis_outcome_measurements')
    .insert({
      decision_id: input.decisionId,
      measurement_key: key,
      status: 'scheduled',
      due_at: dueAt.toISOString(),
      baseline: decision.baseline ?? {},
      expected: decision.expected_outcome ?? {},
      background_job_id: job?.id ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // Race: unique violation → fetch existing
    const { data: again } = await admin
      .from('jarvis_outcome_measurements')
      .select('id')
      .eq('measurement_key', key)
      .maybeSingle()
    if (again?.id) return { ok: true, measurementId: again.id, created: false }
    return { ok: false, error: error.message }
  }

  return { ok: true, measurementId: data!.id as string, created: true }
}

async function fetchFreshMetrics(decision: DecisionRecord): Promise<{
  actual: Record<string, number | null>
  data_status: 'verified' | 'unavailable' | 'failed'
  error?: string
}> {
  try {
    if (decision.system === 'lurvox' || decision.system === 'lurvox_revenue') {
      const rev = await loadLurvoxRevenue({ preset: 'last_n_days', days: 2 })
      if (!rev.ok) {
        return { actual: {}, data_status: 'failed', error: rev.error }
      }
      return {
        actual: {
          gross_inr: typeof rev.gross_inr === 'number' ? rev.gross_inr : null,
          paid_count: typeof rev.paid_count === 'number' ? rev.paid_count : null,
        },
        data_status: 'verified',
      }
    }

    // Default: Meta funnel performance CPA / spend / purchases
    const perf = await getPerformanceByFunnel({ days: 2 })
    const scopeId = decision.scope_id
    const row =
      (scopeId
        ? perf.byFunnel.find((f) => f.funnel_id === scopeId || f.funnel_slug === scopeId)
        : perf.byFunnel.find((f) => f.classified)) || null

    if (!row) {
      return { actual: {}, data_status: 'unavailable', error: 'No matching funnel performance row' }
    }
    return {
      actual: {
        cpa: row.cpa,
        spend: row.spend,
        purchases: row.purchases,
        initial_roas: row.initial_roas,
      },
      data_status: 'verified',
    }
  } catch (err) {
    return {
      actual: {},
      data_status: 'failed',
      error: err instanceof Error ? err.message : 'fetch failed',
    }
  }
}

function expectationsFromDecision(decision: DecisionRecord): MetricExpectation[] {
  const eo = decision.expected_outcome as { metrics?: MetricExpectation[] } | null
  if (eo?.metrics?.length) return eo.metrics
  const baseline = (decision.baseline || {}) as Record<string, unknown>
  const metrics: MetricExpectation[] = []
  if (typeof baseline.cpa === 'number') {
    const target =
      typeof (decision.success_criteria as { cpa_max?: number } | null)?.cpa_max === 'number'
        ? (decision.success_criteria as { cpa_max: number }).cpa_max
        : null
    metrics.push({
      metric: 'cpa',
      baseline: baseline.cpa,
      target,
      direction: 'maintain',
      success_condition: target != null ? `≤ ${target}` : undefined,
    })
  }
  if (typeof baseline.purchases === 'number') {
    metrics.push({
      metric: 'purchases',
      baseline: baseline.purchases,
      direction: 'increase',
    })
  }
  return metrics
}

/**
 * Measure a due outcome. Idempotent: already-measured rows are returned as-is.
 */
export async function measureOutcome(measurementId: string): Promise<{
  ok: boolean
  outcome_state?: OutcomeState
  comparison?: MetricComparison[]
  lesson_id?: string | null
  error?: string
  duplicate?: boolean
}> {
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('jarvis_outcome_measurements')
    .select('*')
    .eq('id', measurementId)
    .maybeSingle()

  if (error || !row) return { ok: false, error: error?.message || 'Measurement not found' }

  if (row.status === 'measured' && row.outcome_state) {
    return {
      ok: true,
      outcome_state: row.outcome_state as OutcomeState,
      comparison: (row.comparison as { metrics?: MetricComparison[] })?.metrics,
      lesson_id: row.lesson_memory_id,
      duplicate: true,
    }
  }

  const gate = await assertAiBudgetAvailable(0.02)
  if (!gate.ok) {
    return { ok: false, error: gate.reason }
  }

  await admin
    .from('jarvis_outcome_measurements')
    .update({ status: 'measuring', updated_at: new Date().toISOString() })
    .eq('id', measurementId)

  const decision = await getDecision(row.decision_id)
  if (!decision) {
    await admin
      .from('jarvis_outcome_measurements')
      .update({ status: 'failed', error: 'Decision missing', updated_at: new Date().toISOString() })
      .eq('id', measurementId)
    return { ok: false, error: 'Decision missing' }
  }

  if (decision.action_status === 'failed' || decision.action_status === 'blocked') {
    const outcome_state: OutcomeState = 'FAILED_ACTION'
    await finalizeMeasurement({
      measurementId,
      decision,
      outcome_state,
      comparisons: [],
      actual: {},
      evidence_label: 'OBSERVED',
      dataUnavailable: false,
    })
    return { ok: true, outcome_state, comparison: [] }
  }

  const fresh = await fetchFreshMetrics(decision)
  if (fresh.data_status !== 'verified') {
    const outcome_state: OutcomeState = 'UNAVAILABLE'
    await finalizeMeasurement({
      measurementId,
      decision,
      outcome_state,
      comparisons: [],
      actual: fresh.actual,
      evidence_label: 'OBSERVED',
      dataUnavailable: true,
      error: fresh.error,
    })
    return { ok: true, outcome_state, comparison: [] }
  }

  const expectations = expectationsFromDecision(decision)
  const comparisons = expectations.map((exp) =>
    compareMetric(exp, fresh.actual[exp.metric] ?? null)
  )
  const outcome_state = classifyOutcome({
    comparisons,
    actionFailed: false,
    dataUnavailable: false,
  })

  const lesson = await evaluateAndStoreLesson({
    decision,
    comparisons,
    outcome_state,
    windowHours: decision.measurement_window_hours,
  })

  await finalizeMeasurement({
    measurementId,
    decision,
    outcome_state,
    comparisons,
    actual: fresh.actual,
    evidence_label: 'TEMPORALLY_ASSOCIATED',
    lessonMemoryId: lesson.lesson_id,
    outcomeMemoryId: lesson.outcome_id,
  })

  return {
    ok: true,
    outcome_state,
    comparison: comparisons,
    lesson_id: lesson.lesson_id,
  }
}

async function finalizeMeasurement(input: {
  measurementId: string
  decision: DecisionRecord
  outcome_state: OutcomeState
  comparisons: MetricComparison[]
  actual: Record<string, unknown>
  evidence_label: EvidenceLabel
  dataUnavailable?: boolean
  error?: string
  lessonMemoryId?: string | null
  outcomeMemoryId?: string | null
}) {
  const admin = createAdminClient()
  await admin
    .from('jarvis_outcome_measurements')
    .update({
      status: input.outcome_state === 'UNAVAILABLE' ? 'unavailable' : 'measured',
      measured_at: new Date().toISOString(),
      actual: input.actual,
      comparison: { metrics: input.comparisons },
      outcome_state: input.outcome_state,
      evidence_label: input.evidence_label,
      lesson_memory_id: input.lessonMemoryId ?? null,
      outcome_memory_id: input.outcomeMemoryId ?? null,
      error: input.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.measurementId)

  // Notify NOTICE+ for underperformance / success of significant decisions — once
  const { data: row } = await admin
    .from('jarvis_outcome_measurements')
    .select('notification_sent, measurement_key')
    .eq('id', input.measurementId)
    .maybeSingle()

  if (row && !row.notification_sent) {
    if (
      input.outcome_state === 'UNDERPERFORMED' ||
      input.outcome_state === 'SUCCESS' ||
      input.outcome_state === 'UNAVAILABLE'
    ) {
      const kind =
        input.outcome_state === 'UNDERPERFORMED'
          ? 'alert'
          : input.outcome_state === 'UNAVAILABLE'
            ? 'info'
            : 'learning'
      await admin.from('jarvis_notifications').insert({
        kind,
        title: `Outcome: ${input.outcome_state}`,
        body: `${input.decision.objective.slice(0, 160)} — ${input.outcome_state}`,
        link: '/admin/jarvis',
        metadata: {
          decision_id: input.decision.id,
          measurement_id: input.measurementId,
          outcome_state: input.outcome_state,
        },
      })
      await admin
        .from('jarvis_outcome_measurements')
        .update({ notification_sent: true })
        .eq('id', input.measurementId)
    }
  }
}

async function evaluateAndStoreLesson(input: {
  decision: DecisionRecord
  comparisons: MetricComparison[]
  outcome_state: OutcomeState
  windowHours: number
}): Promise<{ lesson_id: string | null; outcome_id: string | null }> {
  // Always store OUTCOME memory; LESSON only when meaningful + reusable
  const primary = input.comparisons[0]
  const statement = primary
    ? observationalStatement({
        metric: primary.metric,
        before: primary.before,
        after: primary.after,
        windowHours: input.windowHours,
        actionLabel: input.decision.objective.slice(0, 80),
      })
    : `Outcome ${input.outcome_state} for decision ${input.decision.id}`

  const outcomeMem = await remember({
    category: 'outcome',
    kind: 'OUTCOME',
    title: `Outcome ${input.outcome_state}`,
    summary: statement,
    source: 'jarvis.outcome_engine',
    confidence: 'low',
    tags: ['outcome_record', input.outcome_state.toLowerCase(), input.decision.system],
    evidence: [`decision:${input.decision.id}`, ...input.comparisons.map((c) => c.statement.slice(0, 120))],
    scope: input.decision.scope,
    scopeId: input.decision.scope_id,
    evidenceLabel: 'TEMPORALLY_ASSOCIATED',
    details: {
      memory_kind: 'OUTCOME',
      record_type: 'OUTCOME',
      decision_id: input.decision.id,
      outcome_state: input.outcome_state,
      comparisons: input.comparisons,
      scope: input.decision.scope,
      scope_id: input.decision.scope_id,
      evidence_label: 'TEMPORALLY_ASSOCIATED',
      causal_language: 'observational_only',
    },
  }).catch(() => null)

  let lesson_id: string | null = null
  const meaningful =
    input.outcome_state === 'SUCCESS' ||
    input.outcome_state === 'UNDERPERFORMED' ||
    input.outcome_state === 'PARTIAL_SUCCESS'

  if (meaningful && primary && primary.before != null && primary.after != null) {
    const similar = await countSimilarOutcomes({
      system: input.decision.system,
      scope: input.decision.scope,
      scopeId: input.decision.scope_id,
      metric: primary.metric,
      direction: primary.after > primary.before ? 'up' : primary.after < primary.before ? 'down' : 'flat',
    })
    const strength = patternStrength(similar + 1)
    const evidence_label: EvidenceLabel =
      similar + 1 >= 2 ? 'REPEATED_PATTERN' : 'TEMPORALLY_ASSOCIATED'

    const lessonStatement =
      similar + 1 >= 2
        ? `${similar + 1} observed ${input.decision.system} actions in scope ${input.decision.scope} were followed by ${primary.metric} moving ${
            primary.after > primary.before ? 'higher' : 'lower'
          } during their measurement windows. Causality is not established.`
        : statement

    const lesson = await remember({
      category: 'outcome',
      kind: 'LESSON',
      title: `Lesson: ${primary.metric} after ${input.decision.system} action`,
      summary: lessonStatement,
      source: 'jarvis.outcome_engine',
      confidence: strength.confidence,
      tags: [
        'lesson',
        evidence_label.toLowerCase(),
        input.decision.scope,
        ...(similar + 1 >= 2 ? ['repeated_pattern'] : []),
      ],
      evidence: [
        `decision:${input.decision.id}`,
        `outcome_state:${input.outcome_state}`,
        `sample_size:${similar + 1}`,
      ],
      scope: input.decision.scope,
      scopeId: input.decision.scope_id,
      sampleSize: similar + 1,
      evidenceLabel: evidence_label,
      details: {
        memory_kind: 'LESSON',
        record_type: 'LESSON',
        decision_id: input.decision.id,
        scope: input.decision.scope,
        scope_id: input.decision.scope_id,
        sample_size: similar + 1,
        evidence_label,
        pattern_strength: strength.label,
        comparisons: input.comparisons,
        causal_language: 'observational_only',
      },
    }).catch(() => null)

    lesson_id = lesson?.id ?? null

    if (similar + 1 >= 2) {
      await remember({
        category: 'insight',
        kind: 'HYPOTHESIS',
        title: `Hypothesis: ${primary.metric} may be associated with similar ${input.decision.system} actions`,
        summary: `Possible contributor: repeated ${input.decision.system} actions in ${input.decision.scope} may be associated with ${primary.metric} changes. Sample size ${similar + 1}. Causality not established.`,
        source: 'jarvis.outcome_engine',
        confidence: 'low',
        tags: ['hypothesis', 'repeated_pattern'],
        evidence: [`sample_size:${similar + 1}`, `decision:${input.decision.id}`],
        scope: input.decision.scope,
        scopeId: input.decision.scope_id,
        sampleSize: similar + 1,
        evidenceLabel: 'SUPPORTED_HYPOTHESIS',
        details: {
          memory_kind: 'HYPOTHESIS',
          evidence_label: 'SUPPORTED_HYPOTHESIS',
          sample_size: similar + 1,
          scope: input.decision.scope,
          scope_id: input.decision.scope_id,
        },
      }).catch(() => null)
    }
  }

  return { lesson_id, outcome_id: outcomeMem?.id ?? null }
}

async function countSimilarOutcomes(input: {
  system: string
  scope: string
  scopeId: string | null
  metric: string
  direction: 'up' | 'down' | 'flat'
}): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_outcome_measurements')
    .select('id, comparison, outcome_state, jarvis_decisions!inner(system, scope, scope_id)')
    .eq('status', 'measured')
    .in('outcome_state', ['SUCCESS', 'UNDERPERFORMED', 'PARTIAL_SUCCESS'])
    .limit(50)

  let n = 0
  for (const row of data ?? []) {
    const d = row.jarvis_decisions as { system?: string; scope?: string; scope_id?: string | null } | null
    if (!d || d.system !== input.system || d.scope !== input.scope) continue
    if (input.scopeId && d.scope_id && d.scope_id !== input.scopeId) continue
    const metrics = (row.comparison as { metrics?: MetricComparison[] } | null)?.metrics ?? []
    const m = metrics.find((x) => x.metric === input.metric)
    if (!m || m.before == null || m.after == null) continue
    const dir = m.after > m.before ? 'up' : m.after < m.before ? 'down' : 'flat'
    if (dir === input.direction) n += 1
  }
  return n
}

/**
 * Process due outcome measurements (bounded). Idempotent.
 */
export async function processDueOutcomeMeasurements(opts?: {
  maxChecks?: number
}): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const maxChecks = Math.min(opts?.maxChecks ?? 5, 10)
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    return { processed: 0, skipped: 0, errors: [gate.reason] }
  }

  // Mark scheduled → due
  await admin
    .from('jarvis_outcome_measurements')
    .update({ status: 'due', updated_at: now })
    .eq('status', 'scheduled')
    .lte('due_at', now)

  const { data: due } = await admin
    .from('jarvis_outcome_measurements')
    .select('id')
    .eq('status', 'due')
    .order('due_at', { ascending: true })
    .limit(maxChecks)

  let processed = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of due ?? []) {
    const result = await measureOutcome(row.id)
    if (result.ok) {
      processed += 1
      if (result.duplicate) skipped += 1
    } else {
      errors.push(result.error || 'measure failed')
    }
  }

  return { processed, skipped, errors }
}
