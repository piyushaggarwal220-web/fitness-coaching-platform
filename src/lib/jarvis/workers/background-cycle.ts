import { createAdminClient } from '@/lib/supabase/admin'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { runTool } from '@/lib/jarvis/core/action-runner'
import { assertAiBudgetAvailable, getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { remember } from '@/lib/jarvis/memory/business-memory'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import {
  detectProactiveFindings,
  notificationKindForSeverity,
} from '@/lib/jarvis/workers/proactive'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'

type Priority = 'high' | 'medium' | 'low' | 'none'

function priorityFromSeverity(
  severity: 'NONE' | 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL'
): Priority {
  if (severity === 'CRITICAL') return 'high'
  if (severity === 'WARNING') return 'medium'
  if (severity === 'NOTICE') return 'low'
  return 'none'
}

/** @deprecated Prefer detectProactiveFindings — kept for callers expecting findings:string[] */
function detectAnomalies(perf: Awaited<ReturnType<typeof getPerformanceByFunnel>>): {
  priority: Priority
  findings: string[]
} {
  const result = detectProactiveFindings({
    funnelPerformance: perf,
  })
  return {
    priority: priorityFromSeverity(result.severity),
    findings: result.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`),
  }
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
    const [lurvoxToday, lurvoxYesterday, metaStatus, pendingCount, { count: failedJobCount }] =
      await Promise.all([
        loadLurvoxRevenue({ preset: 'today' }).catch(() => null),
        loadLurvoxRevenue({ preset: 'yesterday' }).catch(() => null),
        loadMetaIntegrationStatus().catch(() => null),
        listPendingApprovals(50).then((a) => a.length),
        admin
          .from('jarvis_background_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed'),
      ])

    const costDash = await getCostDashboard()
    const budgetNear =
      costDash.daily_limit_usd > 0 &&
      costDash.daily_spent_usd / costDash.daily_limit_usd >= 0.9

    const proactive = detectProactiveFindings({
      funnelPerformance: perf,
      lurvox: lurvoxToday
        ? {
            ok: Boolean(lurvoxToday.ok),
            today_gross_inr:
              typeof lurvoxToday.gross_inr === 'number' ? lurvoxToday.gross_inr : null,
            yesterday_gross_inr:
              lurvoxYesterday && typeof lurvoxYesterday.gross_inr === 'number'
                ? lurvoxYesterday.gross_inr
                : null,
            data_status: lurvoxToday.data_status,
          }
        : null,
      pendingApprovals: pendingCount,
      failedJobs: failedJobCount ?? 0,
      metaConfigured: metaStatus?.configured,
      metaLastSyncAt: metaStatus?.lastSyncAt ?? null,
      budgetNearExhaustion: budgetNear,
    })

    const anomalies = {
      priority: priorityFromSeverity(proactive.severity),
      findings: proactive.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`),
      severity: proactive.severity,
      shouldNotify: proactive.shouldNotify,
    }
    observed.push(...anomalies.findings)
    if (!anomalies.findings.length) {
      observed.push('No NOTICE+ proactive findings in the observe window.')
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

    // Bounded Instagram organic sync (READ-ONLY). At most once per quiet/busy cycle when budget allows.
    const igStill = await assertAiBudgetAvailable(0.05)
    if (igStill.ok && spent < budgets.per_task_budget_usd) {
      const igStatus = await runTool('instagram.status', {}, ctx)
      spent += igStatus.costUsd
      const igOut = igStatus.output as { ok?: boolean; configured?: boolean } | undefined
      if (igStatus.status === 'executed' && (igOut?.ok || igOut?.configured)) {
        const igSync = await runTool('instagram.sync_content', { mediaLimit: 8 }, ctx)
        spent += igSync.costUsd
        actions.push(`instagram_sync:${igSync.status}`)
        if (igSync.status === 'executed') {
          const out = igSync.output as {
            media_fetched?: number
            snapshots_upserted?: number
            username?: string | null
          } | undefined
          observed.push(
            `Instagram sync: ${out?.media_fetched ?? 0} media, ${out?.snapshots_upserted ?? 0} snapshot rows (@${out?.username ?? 'account'}).`
          )
          // Light analysis only when we actually stored something
          if ((out?.snapshots_upserted ?? 0) > 0 && spent + 0.02 < budgets.per_task_budget_usd) {
            const igAnalyze = await runTool(
              'instagram.analyze_performance',
              { days: 30, writeMemory: true },
              ctx
            )
            spent += igAnalyze.costUsd
            actions.push(`instagram_analyze:${igAnalyze.status}`)
            const analysis = igAnalyze.output as {
              value?: { strongest_patterns?: string[]; sample_size?: number } | null
            } | undefined
            const patterns = analysis?.value?.strongest_patterns ?? []
            if (patterns[0]) {
              learned.push(patterns[0])
            } else if (analysis?.value?.sample_size) {
              learned.push(
                `Instagram intelligence: reviewed ${analysis.value.sample_size} synced posts (no strong format claim yet).`
              )
            }

            // Optional: prepare content ideas only — never publish, never draft-to-live
            if (
              (analysis?.value?.sample_size ?? 0) >= 3 &&
              spent + 0.2 < budgets.per_task_budget_usd
            ) {
              const plan = await runTool(
                'instagram.plan_content',
                { number_of_ideas: 2, research: false, save: true },
                ctx
              )
              spent += plan.costUsd
              actions.push(`instagram_plan:${plan.status}`)
              if (plan.status === 'executed') {
                recommends.push('Review 2 evidence-backed Instagram ideas prepared in marketing_content (not published).')
              }
            }
          }
        }
      } else {
        actions.push('instagram_sync:skipped_not_configured')
      }
    } else {
      actions.push('instagram_sync:skipped_budget')
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
        kind: 'HYPOTHESIS',
        title: 'Quiet overnight cycle',
        summary:
          'Background cycle found no NOTICE+ findings requiring expensive action. This is an observation, not a causal claim.',
        confidence: 'medium',
        actorId: opts?.actorId ?? null,
        tags: ['background', 'noop', 'hypothesis'],
        source: 'jarvis.background_cycle',
      })
    } else if (anomalies.shouldNotify) {
      const summary = `${anomalies.severity}. ${anomalies.findings.slice(0, 2).join(' ')}`
      await admin.from('jarvis_notifications').insert({
        kind: notificationKindForSeverity(
          anomalies.severity === 'NONE' ? 'INFO' : anomalies.severity
        ),
        title: 'While you were away',
        body: summary.slice(0, 400),
        link: '/admin/jarvis',
        metadata: {
          findings: anomalies.findings,
          actions,
          severity: anomalies.severity,
        },
      })
      learned.push(summary)
      await remember({
        category: 'decision',
        kind: 'DECISION',
        title: `Background ${anomalies.priority} findings`,
        summary,
        confidence: anomalies.priority === 'high' ? 'high' : 'medium',
        actorId: opts?.actorId ?? null,
        tags: ['background', anomalies.priority, String(anomalies.severity)],
        details: { findings: anomalies.findings, actions, severity: anomalies.severity },
        source: 'jarvis.background_cycle',
      })
      recommends.push('Open Approvals panel and review SIGNIFICANT actions before spend changes.')
    }

    const cost = await getCostDashboard()

    // Phase 3: process due outcome measurements + memory maintenance (bounded, cost-governed)
    let learning: Record<string, unknown> | null = null
    const learnGate = await assertAiBudgetAvailable(0.05)
    if (learnGate.ok && spent + 0.05 < budgets.per_task_budget_usd) {
      const { runLearningMaintenance } = await import('@/lib/jarvis/memory/learning-loop')
      const maint = await runLearningMaintenance({ maxOutcomeChecks: 5, maxStaleMarks: 10 })
      learning = maint as unknown as Record<string, unknown>
      try {
        const { runTasteMaintenance } = await import('@/lib/jarvis/taste')
        const taste = await runTasteMaintenance({ maxStaleMarks: 10 })
        learning = { ...learning, taste }
        if (taste.notification) actions.push('taste:confirmation_ask')
        actions.push(`taste:active=${taste.active},candidates=${taste.candidates}`)
      } catch {
        actions.push('taste:skipped')
      }
      try {
        const { runNicheIntelligenceMaintenance } = await import(
          '@/lib/jarvis/instagram/niche'
        )
        const niche = await runNicheIntelligenceMaintenance({ maxSpendUsd: 0.15 })
        learning = { ...learning, niche }
        for (const a of niche.actions) actions.push(a)
        if (niche.alert) actions.push('niche:alert')
        spent += niche.spent_usd
      } catch {
        actions.push('niche:skipped')
      }
      if (maint.outcomes.processed > 0) {
        actions.push(`outcomes:processed_${maint.outcomes.processed}`)
        learned.push(`Measured ${maint.outcomes.processed} due outcome check(s).`)
      }
      if (maint.stale.marked > 0) {
        actions.push(`memory_stale:${maint.stale.marked}`)
      }
      if (maint.paused_budget) {
        actions.push('learning:PAUSED_BUDGET')
      }
    } else {
      actions.push('learning:skipped_budget')
    }

    // Phase 4: continue video intelligence sessions (bounded)
    let videoIntel: Record<string, unknown> | null = null
    const viGate = await assertAiBudgetAvailable(0.1)
    if (viGate.ok && spent + 0.1 < budgets.per_task_budget_usd) {
      const { processDueVideoIntelligence } = await import('@/lib/jarvis/video/intelligence')
      const vi = await processDueVideoIntelligence({ maxSessions: 1 })
      videoIntel = vi as unknown as Record<string, unknown>
      if (vi.processed > 0) {
        actions.push(`video_intel:sessions_${vi.processed}`)
        learned.push(`Advanced ${vi.processed} video intelligence session(s).`)
      }
      if (vi.paused_budget) actions.push('video_intel:PAUSED_BUDGET')
    } else {
      actions.push('video_intel:skipped_budget')
    }

    // Phase 6: poll stuck EDL renders if webhook missed (bounded, no publish)
    let videoEditor: Record<string, unknown> | null = null
    try {
      const adminDb = createAdminClient()
      const { data: stuck } = await adminDb
        .from('video_edit_jobs')
        .select('id, provider_job_id, edl_id, status')
        .eq('status', 'rendering')
        .not('provider_job_id', 'is', null)
        .not('edl_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1)
      if (stuck?.[0]?.provider_job_id) {
        const { getVideoEditProvider } = await import('@/lib/jarvis/video/provider')
        const provider = getVideoEditProvider()
        if (provider.getResult && stuck[0].provider_job_id) {
          const result = await provider.getResult(stuck[0].provider_job_id)
          if (result.status === 'completed' && result.output_video) {
            const { completeVideoJobFromWebhook } = await import(
              '@/lib/ai-marketing/workflows/video-jobs'
            )
            await completeVideoJobFromWebhook({
              jobId: stuck[0].id,
              providerJobId: stuck[0].provider_job_id,
              status: 'completed',
              outputVideo: result.output_video,
              verifiedByProvider: true,
            })
            actions.push('video_editor:recovered_render')
            videoEditor = { recovered_job_id: stuck[0].id, edl_id: stuck[0].edl_id }
          }
        }
      }
    } catch {
      /* non-fatal */
    }

    // Phase 9: content operations — due schedules, briefs, stuck flags (no auto live publish)
    let contentOps: Record<string, unknown> | null = null
    try {
      const { runContentOpsMaintenance } = await import('@/lib/jarvis/content-ops')
      contentOps = await runContentOpsMaintenance({ actorId: opts?.actorId ?? null })
      const copActions = (contentOps.actions as string[]) ?? []
      for (const a of copActions.slice(0, 8)) actions.push(`content_ops:${a}`)
    } catch {
      actions.push('content_ops:error')
    }

    // Phase 10: autonomous business operator (observe → detect → investigate → brief)
    let autonomous: Record<string, unknown> | null = null
    try {
      const autoGate = await assertAiBudgetAvailable(0.05)
      if (autoGate.ok && spent + 0.05 < budgets.per_task_budget_usd) {
        const { runAutonomousOperatorCycle } = await import('@/lib/jarvis/autonomous')
        autonomous = await runAutonomousOperatorCycle({
          actorId: opts?.actorId ?? null,
          cycleId: jobId,
          allowExpensiveInvestigation: anomalies.priority === 'high',
        })
        const aa = (autonomous.actions as string[]) ?? []
        for (const a of aa.slice(0, 10)) actions.push(`autonomous:${a}`)
        if (autonomous.status === 'PAUSED_BUDGET') actions.push('autonomous:PAUSED_BUDGET')
      } else {
        actions.push('autonomous:skipped_budget')
      }
    } catch {
      actions.push('autonomous:error')
    }

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
          learning,
          video_intelligence: videoIntel,
          video_editor: videoEditor,
          content_ops: contentOps,
          autonomous_operator: autonomous,
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
      execution_result: {
        priority: anomalies.priority,
        actions,
        spent,
        learning,
        video_intelligence: videoIntel,
        content_ops: contentOps,
        autonomous_operator: autonomous,
      },
    })

    return {
      ok: true,
      priority: anomalies.priority,
      observed,
      actions,
      waiting,
      spent,
      learning,
      video_intelligence: videoIntel,
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
