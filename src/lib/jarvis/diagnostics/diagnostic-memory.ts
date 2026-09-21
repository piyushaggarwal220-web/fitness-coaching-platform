import { createAdminClient } from '@/lib/supabase/admin'
import { remember, searchMemory } from '@/lib/jarvis/memory/business-memory'
import { redactDiagnosticValue } from './redact'
import type { DiagnosticReport } from './diagnostic-types'

export async function recallSimilarIncidents(problem: string) {
  try {
    const memory = await searchMemory({
      query: problem,
      category: 'outcome',
      limit: 8,
    })
    const tagged = memory.filter((row) =>
      (Array.isArray(row.tags) ? row.tags : []).some(
        (t: unknown) => String(t) === 'diagnostic' || String(t) === 'regression'
      )
    )
    const admin = createAdminClient()
    const { data: incidents } = await admin
      .from('jarvis_incidents')
      .select('id, incident_id, symptom, root_cause, status, resolution, memory_id, detected_at')
      .order('detected_at', { ascending: false })
      .limit(20)
    const needle = problem.toLowerCase()
    const matched = (incidents ?? []).filter((row) => {
      const hay = `${row.symptom ?? ''} ${row.root_cause ?? ''}`.toLowerCase()
      return needle.split(/\s+/).some((w) => w.length > 3 && hay.includes(w))
    })
    return { memory: tagged, incidents: matched }
  } catch {
    return { memory: [], incidents: [] }
  }
}

export async function persistIncident(report: DiagnosticReport, actorId?: string | null) {
  try {
    const admin = createAdminClient()
    const row = {
      incident_id: report.incident_id,
      detected_at: report.detected_at,
      system: report.system,
      user_request: report.user_request,
      symptom: report.symptom,
      diagnostic_steps: redactDiagnosticValue(report.diagnostic_steps),
      evidence: redactDiagnosticValue(report.evidence),
      root_cause: report.root_cause?.summary ?? null,
      proposed_fix: redactDiagnosticValue(report.proposed_fix),
      approval_id: report.approval_id ?? null,
      fix: redactDiagnosticValue(report.applied_fixes),
      verification: redactDiagnosticValue(report.verification),
      resolution: report.resolution,
      status: report.status,
      risk_level: report.proposed_fix[0]?.risk ?? 'medium',
      memory_id: report.memory_id ?? null,
      data_status: report.data_status,
      created_by: actorId ?? null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await admin
      .from('jarvis_incidents')
      .upsert(row, { onConflict: 'incident_id' })
      .select('id')
      .maybeSingle()
    if (error) return { ok: false as const, error: error.message, id: null }
    return { ok: true as const, id: data?.id as string | undefined, error: null }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'persist failed',
      id: null,
    }
  }
}

export async function persistDiagnosticRun(input: {
  incidentDbId?: string | null
  problem: string
  report: DiagnosticReport
  model: string
  budget: unknown
}) {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('jarvis_diagnostic_runs')
      .insert({
        incident_id: input.incidentDbId ?? null,
        stage: 'learn',
        status: input.report.budget_exhausted
          ? 'budget_exhausted'
          : input.report.status === 'failed'
            ? 'failed'
            : 'completed',
        problem: input.problem,
        steps: redactDiagnosticValue(input.report.diagnostic_steps),
        findings: redactDiagnosticValue(input.report.findings),
        model: input.model,
        result: redactDiagnosticValue({
          root_cause: input.report.root_cause,
          status: input.report.status,
          budget: input.budget,
        }),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, id: data?.id }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'run persist failed' }
  }
}

export async function rememberResolvedIncident(report: DiagnosticReport, actorId?: string | null) {
  try {
    const memory = await remember({
      category: 'outcome',
      title: `Diagnostic: ${report.symptom.slice(0, 80)}`,
      summary: [
        `Problem: ${report.symptom}`,
        `Root cause: ${report.root_cause?.summary ?? 'unverified'}`,
        report.proposed_fix[0] ? `Proposed fix: ${report.proposed_fix[0].title}` : null,
        report.verification ? `Verification: ${JSON.stringify(report.verification).slice(0, 240)}` : null,
        'Future: run the stored regression test before changing this pipeline.',
      ]
        .filter(Boolean)
        .join('\n'),
      confidence: report.root_cause?.confidence ?? 'medium',
      tags: ['diagnostic', 'regression', report.system],
      details: redactDiagnosticValue({
        incident_id: report.incident_id,
        pipeline_break: report.root_cause?.pipeline_break,
        data_status: report.data_status,
        regression_tests: report.regression_tests,
      }) as Record<string, unknown>,
      actorId,
      source: 'jarvis_diagnostics',
    })
    return memory?.id as string | undefined
  } catch {
    return undefined
  }
}

export async function persistRegressionTests(
  incidentDbId: string | null,
  tests: { name: string; assertion: string; system?: string }[]
) {
  if (!tests.length) return
  try {
    const admin = createAdminClient()
    await admin.from('jarvis_regression_tests').insert(
      tests.map((t) => ({
        incident_id: incidentDbId,
        name: t.name,
        assertion: t.assertion,
        system: t.system ?? 'jarvis',
        spec: { name: t.name, assertion: t.assertion },
        status: 'active',
      }))
    )
  } catch {
    /* tables may not exist in unit tests */
  }
}

export async function listIncidents(status?: string) {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_incidents')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(50)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listRegressionTests() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_regression_tests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listDiagnosticRuns() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_diagnostic_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return data ?? []
}
