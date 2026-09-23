import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { selectModel } from './model-router'
import { DiagnosticBudgetTracker } from './diagnostic-budget'
import { DiagnosticRunner } from './diagnostic-runner'
import { runHealthChecks, selfTestLine, overallHealth } from './health-checks'
import { getDiagnosticHandler, resolveDiagnosticKind } from './diagnostic-registry'
import { evaluateRemediationPermission, applySafeRemediation } from './safe-debugger'
import { executeSafeToolTest } from './tool-contract-tester'
import { redactDiagnosticValue } from './redact'
import {
  persistDiagnosticRun,
  persistIncident,
  persistRegressionTests,
  recallSimilarIncidents,
  rememberResolvedIncident,
} from './diagnostic-memory'
import type {
  DiagnosticReport,
  DiagnosticRunInput,
  IncidentStatus,
  ProposedRemediation,
} from './diagnostic-types'
import { classifyProblem } from './root-cause-engine'

function newIncidentId() {
  const d = new Date()
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `JARVIS-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function whyQuestion(problem: string) {
  return /\bwhy\b/i.test(problem)
}

export async function runDiagnostic(input: DiagnosticRunInput): Promise<DiagnosticReport> {
  const problem = input.problem.trim()
  const classified = classifyProblem(problem)
  const incidentId = newIncidentId()
  const modelPick = selectModel({
    taskType: 'diagnostic',
    complexity: whyQuestion(problem) ? 'complex' : 'standard',
    risk: 'medium',
  })
  const budget = new DiagnosticBudgetTracker(input.budget)
  const runner = new DiagnosticRunner(budget)
  const persist = input.persist !== false

  const gate = await assertAiBudgetAvailable(0.02).catch(
    () => ({ ok: true as const, dailySpent: 0, dailyLimit: 0, remaining: 0 })
  )
  if (!gate.ok) {
    return {
      incident_id: incidentId,
      detected_at: new Date().toISOString(),
      system: classified.system,
      user_request: input.userRequest || problem,
      symptom: problem,
      stages_completed: ['observe'],
      diagnostic_steps: [],
      evidence: [],
      findings: [],
      root_cause: null,
      proposed_fix: [],
      approval_required: false,
      applied_fixes: [],
      verification: null,
      resolution: gate.reason,
      status: 'budget_exhausted',
      regression_tests: [],
      budget_exhausted: true,
      model: modelPick.model,
      data_status: 'unknown',
    }
  }

  await runner.step('observe', 'capture symptom', () => problem)
  const similar = await runner.step('detect', 'recall similar incidents', () => recallSimilarIncidents(problem))

  const handler = getDiagnosticHandler(resolveDiagnosticKind(problem))
  const trace = await runner.step('investigate', `investigate ${classified.system} pipeline`, async () => {
    const toolGate = budget.consumeToolCall()
    if (!toolGate.ok) throw new Error(toolGate.reason)
    if (!handler) throw new Error('No diagnostic handler')
    return handler(problem)
  })

  const diagnosed = await runner.step('diagnose', 'root cause', () => trace?.root ?? null)
  const proposed = (trace?.remediations ?? []).map((r) => ({
    ...r,
    permission: evaluateRemediationPermission(r.kind),
  }))

  await runner.step('propose_fix', 'propose remediations', () => proposed)

  const significant = proposed.filter((r) => r.permission === 'require_approval')
  const safe = proposed.filter((r) => r.permission === 'auto')
  let approvalId: string | null = null
  let applied: string[] = []
  let status: IncidentStatus = diagnosed ? 'diagnosed' : 'failed'

  const perm = await runner.step('permission_check', 'permission check', () => ({
    significant: significant.length,
    safe: safe.length,
  }))

  if (perm && safe.length && !budget.exhaustedReason) {
    const appliedResult = await runner.step('apply_fix', 'apply safe remediations', async () => {
      const out: string[] = []
      for (const rem of safe) {
        const result = await applySafeRemediation(rem.kind)
        if (result.applied) out.push(rem.id)
      }
      return out
    })
    applied = appliedResult ?? []
  }

  if (significant.length) {
    status = 'awaiting_approval'
    if (persist) {
      approvalId = await createDiagnosticApproval({
        conversationId: input.conversationId ?? null,
        taskId: input.taskId ?? null,
        actorId: input.actorId ?? null,
        remediations: significant,
        symptom: problem,
        root: diagnosed?.summary ?? 'See diagnostic report',
      })
    }
  }

  const verification = await runner.step('test', 'contract tests', async () => {
    const tests = []
    if (classified.system === 'shopify') {
      tests.push(await executeSafeToolTest('shopify.today_revenue', {}))
      tests.push(await executeSafeToolTest('shopify.order_stats', { days: 2 }))
    }
    return { tests, similar: similar ?? { memory: [], incidents: [] } }
  })

  await runner.step('verify', 'verify data_status honesty', () => {
    const hidden = (verification?.tests ?? []).flatMap((t) =>
      t.anomalies.filter((a) => a.type === 'hidden_failure' || a.type === 'unexpected_zero')
    )
    return { hidden_failures: hidden.length }
  })

  const regressionTests = proposed
    .filter((p) => p.kind === 'code_change')
    .map((p) => ({
      name: p.title,
      assertion:
        p.id === 'use_shop_timezone'
          ? 'Shopify revenue for IST calendar day must not use UTC midnight.'
          : p.title,
    }))

  const report: DiagnosticReport = {
    incident_id: incidentId,
    detected_at: new Date().toISOString(),
    system: classified.system,
    user_request: input.userRequest || problem,
    symptom: problem,
    stages_completed: runner.stages,
    diagnostic_steps: runner.steps,
    evidence: trace?.evidence ?? [],
    findings: trace?.findings ?? [],
    root_cause: diagnosed,
    proposed_fix: proposed,
    approval_id: approvalId,
    approval_required: significant.length > 0,
    applied_fixes: applied,
    verification: verification ? redactDiagnosticValue(verification) as Record<string, unknown> : null,
    resolution: budget.exhaustedReason
      ? budget.exhaustedReason
      : significant.length
        ? 'Diagnosis complete. Significant fix requires owner approval before code/schema/config changes.'
        : diagnosed?.summary ?? 'Diagnostic complete.',
    status: budget.exhaustedReason ? 'budget_exhausted' : status,
    regression_tests: regressionTests,
    budget_exhausted: Boolean(budget.exhaustedReason),
    model: modelPick.model,
    data_status: diagnosed?.cannot_conclude_business
      ? 'failed'
      : classified.system === 'shopify'
        ? (trace?.root.findings.find((f) => f.id === 'admin_api_empty') ? 'verified' : diagnosed?.findings[0]?.data_status || 'unknown')
        : 'unknown',
  }

  if (similar && 'incidents' in similar && similar.incidents.length) {
    report.findings = [
      {
        id: 'memory_hit',
        title: 'Similar past incident recalled',
        severity: 'low',
        system: 'memory',
        detail: `Matched ${similar.incidents.length} prior incident(s). Avoid rediscovering from scratch.`,
      },
      ...report.findings,
    ]
  }

  if (persist) {
    const saved = await persistIncident(report, input.actorId)
    report.db_id = saved.id ?? null
    await persistDiagnosticRun({
      incidentDbId: saved.id,
      problem,
      report,
      model: modelPick.model,
      budget: budget.snapshot(),
    })
    await persistRegressionTests(saved.id ?? null, regressionTests.map((t) => ({ ...t, system: classified.system })))
    report.memory_id = (await rememberResolvedIncident(report, input.actorId)) ?? null
  }

  await runner.step('learn', 'record diagnostic outcome', () => true)
  report.stages_completed = runner.stages
  report.diagnostic_steps = runner.steps
  return report
}

async function createDiagnosticApproval(input: {
  conversationId: string | null
  taskId: string | null
  actorId: string | null
  remediations: ProposedRemediation[]
  symptom: string
  root: string
}): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: toolCall } = await admin
      .from('jarvis_tool_calls')
      .insert({
        task_id: input.taskId,
        conversation_id: input.conversationId,
        tool_name: 'diagnostics.propose_fix',
        input: { symptom: input.symptom },
        risk_class: 'SIGNIFICANT',
        permission_result: 'requires_approval',
        estimated_cost_usd: 0,
      })
      .select('id')
      .maybeSingle()

    const primary = input.remediations[0]
    const remediationTitle = primary?.title || 'Apply diagnostic fix'
    const { data, error } = await admin
      .from('jarvis_approvals')
      .insert({
        conversation_id: input.conversationId,
        task_id: input.taskId,
        tool_call_id: toolCall?.id ?? null,
        tool_name: 'diagnostics.propose_fix',
        // Never present a code-change remediation as if it were a live data query.
        action_label: `Diagnostic code change: ${remediationTitle}`,
        reason: `${input.root}\n\nDIAGNOSIS\n${input.root}\n\nPROPOSED FIX\n${input.remediations.map((r) => r.description).join('\n')}`,
        evidence: [
          'Tool: diagnostics.propose_fix (SIGNIFICANT)',
          'This is a proposed code/config remediation — not a live Shopify/Meta/Instagram read.',
          ...input.remediations.map((r) => r.title),
        ],
        current_state: primary?.current_state ?? {},
        proposed_state: primary?.proposed_state ?? { remediations: input.remediations },
        expected_cost_note: 'No production writes until approved. Code changes still require implementation after approval.',
        risk_level: primary?.risk ?? 'medium',
        risk_class: 'SIGNIFICANT',
        status: 'pending',
      })
      .select('id')
      .maybeSingle()
    if (error) return null
    await admin.from('jarvis_notifications').insert({
      kind: 'approval',
      title: 'Diagnostic fix needs approval',
      body: `Diagnostic code change: ${remediationTitle}`,
      link: '/admin/jarvis',
      metadata: { approval_id: data?.id },
    })
    return data?.id ?? null
  } catch {
    return null
  }
}

export async function runSelfTest() {
  const checks = await runHealthChecks()
  const deeper = []
  if (checks.find((c) => c.id === 'shopify' && c.status === 'healthy')) {
    deeper.push(await executeSafeToolTest('shopify.list_products', { limit: 1 }))
    deeper.push(await executeSafeToolTest('shopify.list_orders', { limit: 1 }))
    deeper.push(await executeSafeToolTest('shopify.today_revenue', {}))
  }
  if (checks.find((c) => c.id === 'meta' && (c.status === 'healthy' || c.status === 'degraded'))) {
    deeper.push(await executeSafeToolTest('meta.status', {}))
    deeper.push(await executeSafeToolTest('funnels.performance', { days: 1 }))
  }
  return {
    overall: overallHealth(checks),
    lines: checks.map(selfTestLine),
    checks,
    deeper,
  }
}

export function formatDiagnosticReply(report: DiagnosticReport): string {
  const lines = [
    `DIAGNOSIS`,
    report.root_cause?.summary || report.symptom,
    '',
    report.findings.length ? `FINDINGS` : '',
    ...report.findings.slice(0, 8).map((f) => `- ${f.title}: ${f.detail}`),
    '',
  ]
  if (report.proposed_fix.length) {
    lines.push('PROPOSED FIX')
    for (const fix of report.proposed_fix) {
      lines.push(`${fix.title}`)
      lines.push(fix.description)
      lines.push(`RISK: ${fix.risk}. Permission: ${fix.permission}.`)
      lines.push('TEST PLAN')
      fix.test_plan.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
    }
    if (report.approval_required) {
      lines.push('')
      lines.push('ACTION REQUIRED')
      lines.push('Approve fix? Jarvis will not modify production source, schema, credentials, or campaign settings until you approve.')
    }
  }
  if (report.budget_exhausted) {
    lines.push('')
    lines.push(report.resolution || 'Diagnostic budget exhausted before root cause could be verified.')
  }
  if (report.data_status === 'failed' || report.data_status === 'unavailable') {
    lines.push('')
    lines.push('Jarvis will not treat this as ₹0 / zero. The data is not usable for business conclusions.')
  }
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

export { whyQuestion }
