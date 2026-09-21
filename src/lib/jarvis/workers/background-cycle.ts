import { createAdminClient } from '@/lib/supabase/admin'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { runTool } from '@/lib/jarvis/core/action-runner'
import { assertAiBudgetAvailable, getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { remember } from '@/lib/jarvis/memory/business-memory'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'

type Priority = 'high' | 'medium' | 'low' | 'none'

function detectAnomalies(perf: Awaited<ReturnType<typeof getPerformanceByFunnel>>): {
  priority: Priority
  findings: string[]
} {
  const findings: string[] = []
  let priority: Priority = 'none'

  for (const f of perf.byFunnel) {
    if (!f.classified) continue
    if (f.spend <= 0) continue

    if (
      f.cpa != null &&
      f.max_acceptable_cpa != null &&
      f.cpa > f.max_acceptable_cpa &&
      f.spend >= 500
    ) {
      findings.push(
        `${f.funnel_name}: CPA ₹${f.cpa.toFixed(0)} > max ₹${f.max_acceptable_cpa} (spend ₹${f.spend.toFixed(0)})`
      )
      priority = 'high'
    } else if (
      f.cpa != null &&
      f.target_cpa != null &&
      f.cpa > f.target_cpa * 1.35 &&
      f.spend >= 300
    ) {
      findings.push(
        `${f.funnel_name}: CPA ₹${f.cpa.toFixed(0)} well above target ₹${f.target_cpa}`
      )
      if (priority !== 'high') priority = 'medium'
    }

    if (
      f.initial_roas != null &&
      f.target_roas != null &&
      f.initial_roas < f.target_roas * 0.6 &&
      f.spend >= 500
    ) {
      findings.push(
        `${f.funnel_name}: ROAS ${f.initial_roas.toFixed(2)} far below target ${f.target_roas}`
      )
      if (priority === 'none') priority = 'medium'
    }
  }

  if (perf.unclassified.spend > 1000) {
    findings.push(`Unclassified spend ₹${perf.unclassified.spend.toFixed(0)} — classify campaigns`)
    if (priority === 'none') priority = 'medium'
  }

  return { priority, findings }
}

export async function buildActivityDigest(input: {
  observed: string[]
  actions: string[]
  learned: string[]
  waiting: string[]
  recommends: string[]
  spentUsd: number
  summary: string
}) {
  const admin = createAdminClient()
  const digestDate = new Date().toISOString().slice(0, 10)
  await admin.from('jarvis_activity_digests').upsert(
    {
      digest_date: digestDate,
      observed: input.observed,
      actions: input.actions,
      learned: input.learned,
      waiting: input.waiting,
      recommends: input.recommends,
      spent_usd: input.spentUsd,
      summary: input.summary,
    },
    { onConflict: 'digest_date' }
  )
}

/**
 * Lightweight scheduled intelligence — expensive work only on meaningful anomalies.
 */
export async function runJarvisBackgroundCycle(opts?: {
  actorId?: string | null
}): Promise<Record<string, unknown>> {
  ensureJarvisToolsRegistered()
  const admin = createAdminClient()
  const budgets = await getJarvisBudgets()

  if (!budgets.background_enabled) {
    return { skipped: true, reason: 'background_enabled=false' }
  }

  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    const { data: job } = await admin
      .from('jarvis_background_jobs')
      .insert({
        job_type: 'morning_cycle',
        status: 'budget_exhausted',
        error: gate.reason,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    await admin.from('jarvis_tasks').insert({
      objective: 'Background cycle',
      status: 'paused_budget',
      source: 'cron',
      error: gate.reason,
      completed_at: new Date().toISOString(),
    })

    await admin.from('jarvis_notifications').insert({
      kind: 'cost',
      title: 'Jarvis paused — AI budget exhausted',
      body: gate.reason,
      link: '/admin/jarvis',
    })
    return { skipped: true, reason: gate.reason, jobId: job?.id }
  }

  const { data: job } = await admin
    .from('jarvis_background_jobs')
    .insert({
      job_type: 'morning_cycle',
      status: 'running',
      started_at: new Date().toISOString(),
      payload: { phase: 'observe' },
    })
    .select('id')
    .maybeSingle()

  const jobId = job?.id
  let spent = 0
  const observed: string[] = []
  const actions: string[] = []
  const learned: string[] = []
  const recommends: string[] = []

  const ctx = {
    actorId: opts?.actorId ?? null,
    conversationId: null as string | null,
    taskId: null as string | null,
    source: 'cron' as const,
  }

  try {
    // OBSERVE (cheap reads)
    const overview = await runTool('analytics.today_overview', {}, ctx)
    spent += overview.costUsd
    actions.push(`observe:${overview.status}`)

    const perf = await getPerformanceByFunnel({ days: 7 })
    const anomalies = detectAnomalies(perf)
    observed.push(...anomalies.findings)
    if (!anomalies.findings.length) {
      observed.push('No high-priority funnel CPA/ROAS anomalies in the 7-day window.')
    }

    const meta = await runTool('meta.status', {}, ctx)
    spent += meta.costUsd
    const metaOut = meta.output as { configured?: boolean } | undefined

    // Only sync Meta if configured AND (anomaly or never synced recently is not checked — sync is low cost API)
    if (meta.status === 'executed' && metaOut?.configured && anomalies.priority !== 'none') {
      const sync = await runTool('meta.sync', {}, ctx)
      spent += sync.costUsd
      actions.push(`sync:${sync.status}`)
    } else if (meta.status === 'executed' && metaOut?.configured && anomalies.priority === 'none') {
      actions.push('sync:skipped_no_anomaly')
    }

    // Creative fatigue only on medium+
    if (anomalies.priority === 'high' || anomalies.priority === 'medium') {
      const creative = await runTool('creatives.performance', { days: 14 }, ctx)
      spent += creative.costUsd
      actions.push(`creatives:${creative.status}`)
      if (creative.status === 'executed' && Array.isArray(creative.output)) {
        const fat = (creative.output as { classification: string; name: string }[]).filter(
          (c) => c.classification === 'FATIGUED' || c.classification === 'LOSER'
        )
        if (fat.length) {
          observed.push(
            `Creative flags: ${fat
              .slice(0, 3)
              .map((c) => `${c.name}=${c.classification}`)
              .join(', ')}`
          )
        }
      }

      const budgetRec = await runTool('analytics.budget_recommendations', { days: 14 }, ctx)
      spent += budgetRec.costUsd
      actions.push(`budget_recs:${budgetRec.status}`)
    }

    // Expensive report/research ONLY on high priority + budget headroom
    const still = await assertAiBudgetAvailable(0.25)
    if (anomalies.priority === 'high' && still.ok && spent < budgets.per_task_budget_usd) {
      const report = await runTool('analytics.daily_report', { days: 7 }, ctx)
      spent += report.costUsd
      actions.push(`report:${report.status}`)
      recommends.push('Review daily funnel report and pending approvals.')
    } else if (anomalies.priority === 'none') {
      actions.push('expensive_work:skipped_no_change')
    }

    const approvals = await listPendingApprovals(20)
    const waiting = approvals.map(
      (a) => `${a.action_label} (${a.risk_level}) — ${a.tool_name}`
    )

    if (anomalies.priority === 'none') {
      await admin.from('jarvis_notifications').insert({
        kind: 'info',
        title: 'Nothing important changed overnight',
        body: 'Jarvis observed the business and skipped expensive research/report work.',
        link: '/admin/jarvis',
      })
      learned.push('Quiet cycle — no meaningful anomaly requiring spend.')
      await remember({
        category: 'insight',
        title: 'Quiet overnight cycle',
        summary: 'Background cycle found no meaningful change requiring expensive action.',
        confidence: 'medium',
        actorId: opts?.actorId ?? null,
        tags: ['background', 'noop'],
      })
    } else {
      const summary = `Priority ${anomalies.priority}. ${anomalies.findings.slice(0, 2).join(' ')}`
      await admin.from('jarvis_notifications').insert({
        kind: 'alert',
        title: 'While you were away',
        body: summary.slice(0, 400),
        link: '/admin/jarvis',
        metadata: { findings: anomalies.findings, actions },
      })
      learned.push(summary)
      await remember({
        category: 'decision',
        title: `Background ${anomalies.priority} findings`,
        summary,
        confidence: anomalies.priority === 'high' ? 'high' : 'medium',
        actorId: opts?.actorId ?? null,
        tags: ['background', anomalies.priority],
        details: { findings: anomalies.findings, actions },
      })
      recommends.push('Open Approvals panel and review SIGNIFICANT actions before spend changes.')
    }

    const cost = await getCostDashboard()
    const digestSummary = [
      `Observed: ${observed.slice(0, 3).join('; ') || 'none'}`,
      `Did: ${actions.join(', ')}`,
      `Waiting: ${waiting.length} approvals`,
      `Spent: $${spent.toFixed(4)}`,
    ].join(' | ')

    await buildActivityDigest({
      observed,
      actions,
      learned,
      waiting,
      recommends,
      spentUsd: spent,
      summary: digestSummary,
    })

    await admin
      .from('jarvis_background_jobs')
      .update({
        status: 'completed',
        spent_usd: spent,
        result: {
          priority: anomalies.priority,
          observed,
          actions,
          waiting_count: waiting.length,
          cost,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    await writeMarketingAudit({
      agent: 'jarvis',
      decision: 'background_cycle',
      reasoning: digestSummary,
      actor_id: opts?.actorId ?? null,
      execution_result: { priority: anomalies.priority, actions, spent },
    })

    return {
      ok: true,
      priority: anomalies.priority,
      observed,
      actions,
      waiting,
      spent,
      jobId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Background cycle failed'
    await admin
      .from('jarvis_background_jobs')
      .update({
        status: 'failed',
        error: message,
        spent_usd: spent,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return { ok: false, error: message, jobId }
  }
}
