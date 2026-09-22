/**
 * Overnight / background autonomous operator loop.
 * Hooks into existing morning_cycle — does not create a second scheduler.
 *
 * OBSERVE → DETECT → INVESTIGATE → DIAGNOSE → TASK → BRIEF → NOTIFY (meaningful only)
 * Significant actions: APPROVAL_REQUIRED only — never bypass.
 */

import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { notificationKindForSeverity } from '@/lib/jarvis/workers/proactive'
import { zonedYmd, BUSINESS_TIMEZONE } from '@/lib/time/business-calendar'
import { buildUnifiedObservation } from '@/lib/jarvis/autonomous/observation'
import { isSignificantForInvestigation } from '@/lib/jarvis/autonomous/anomalies'
import { planCrossSystemInvestigation } from '@/lib/jarvis/autonomous/investigation'
import { ensureProactiveTask } from '@/lib/jarvis/autonomous/tasks'
import { buildMorningBrief } from '@/lib/jarvis/autonomous/morning-brief'
import {
  persistObservationSnapshot,
  upsertAttentionItems,
  persistMorningBrief,
  notifyIfMeaningful,
} from '@/lib/jarvis/autonomous/store'
import { recordDecision } from '@/lib/jarvis/memory/decisions'

export async function runAutonomousOperatorCycle(opts?: {
  actorId?: string | null
  cycleId?: string | null
  allowExpensiveInvestigation?: boolean
}): Promise<Record<string, unknown>> {
  const actions: string[] = []
  const notes: string[] = []

  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    return {
      status: 'PAUSED_BUDGET',
      reason: gate.reason,
      actions: ['PAUSED_BUDGET'],
    }
  }

  const autonomy = await getAutonomyLevel().catch(() => 2)

  // 1. OBSERVE
  const observation = await buildUnifiedObservation({ cycleId: opts?.cycleId })
  actions.push('observed')

  // 2. Persist snapshot
  const snapshotId = await persistObservationSnapshot(observation, opts?.cycleId)
  if (snapshotId) actions.push('snapshot_persisted')

  // 3. DETECT → upsert attention (deduped)
  const { created, updated } = await upsertAttentionItems(observation.findings)
  actions.push(`attention:created_${created}`, `attention:updated_${updated}`)

  // 4. INVESTIGATE / TASK for significant findings (bounded)
  let tasksCreated = 0
  const significant = observation.findings.filter((f) =>
    isSignificantForInvestigation(f.severity)
  )
  for (const item of significant.slice(0, 3)) {
    const inv = planCrossSystemInvestigation({ attention: item, observation })
    item.diagnosis = inv.diagnosis

    if (autonomy >= 1) {
      const task = await ensureProactiveTask({
        attention: item,
        actorId: opts?.actorId,
      })
      if (task.created) {
        tasksCreated += 1
        actions.push(`task:${task.task_id?.slice(0, 8)}`)
      }

      // Decision ledger: recommendation only at this stage (no auto significant write)
      try {
        await recordDecision({
          objective: item.title,
          system: item.system.toLowerCase(),
          reason: inv.explanation.slice(0, 800),
          evidence: item.evidence,
          expectedOutcome: {
            metrics: [],
            qualitative:
              inv.diagnosis.recommendation[0] ??
              'Investigation complete; significant actions await approval if needed.',
          },
          baseline: { fingerprint: item.fingerprint, severity: item.severity },
          baselineSource: 'jarvis.autonomous.observation',
          measurementWindowHours: 48,
          risk: item.severity === 'CRITICAL' ? 'critical' : item.severity === 'WARNING' ? 'high' : 'medium',
          approvalRequired: item.requires_approval,
          approvalStatus: item.requires_approval ? 'pending' : 'not_required',
          source: 'SYSTEM_AUTOMATION',
          actorId: opts?.actorId,
          actionInput: {
            fingerprint: item.fingerprint,
            action_state: item.requires_approval ? 'APPROVAL_REQUIRED' : 'PREPARED',
            autonomy,
            pattern_id: inv.pattern_id,
          },
        })
        actions.push('decision_recorded')
      } catch {
        /* optional schema */
      }
    }
  }
  notes.push(`tasks_created=${tasksCreated}`)

  // 5. Opportunities — notify optionally, never auto-publish
  for (const opp of observation.opportunities.slice(0, 2)) {
    if (autonomy < 1) break
    const n = await notifyIfMeaningful({
      fingerprint: opp.fingerprint,
      kind: 'info',
      title: `Opportunity: ${opp.title}`,
      body: [
        'OBSERVED:',
        ...opp.observed,
        'INFERENCE:',
        ...opp.inference,
        'RECOMMENDATION:',
        ...opp.recommendation,
      ].join('\n'),
      metadata: { type: 'opportunity' },
    })
    if (n.notified) actions.push('opportunity_notified')
  }

  // 6. Morning brief
  const approvals = await listPendingApprovals(5).catch(() => [])
  const pendingLabel = approvals[0]
    ? String(approvals[0].action_label || approvals[0].tool_name)
    : null
  const brief = buildMorningBrief(observation, { pendingApprovalLabel: pendingLabel })
  const briefDate = zonedYmd(new Date(observation.observed_at), BUSINESS_TIMEZONE)
  await persistMorningBrief({
    briefDate,
    text: brief.text,
    structured: brief.structured,
    meaningful: brief.meaningful,
    snapshotId,
  })
  actions.push(brief.meaningful ? 'brief_meaningful' : 'brief_quiet')

  // 7. Notify only when meaningful (deduped)
  if (brief.meaningful && observation.findings.some((f) => f.severity !== 'INFO')) {
    const top = observation.findings.find(
      (f) => f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'NOTICE'
    )
    if (top) {
      const n = await notifyIfMeaningful({
        fingerprint: `brief:${briefDate}:${top.fingerprint}`,
        kind: notificationKindForSeverity(top.severity),
        title: 'JARVIS morning brief',
        body: brief.text.slice(0, 600),
        metadata: { type: 'morning_brief', brief_date: briefDate },
      })
      if (n.notified) actions.push('brief_notified')
      else actions.push('brief_deduped')
    }
  } else {
    actions.push('quiet_no_notify')
  }

  return {
    status: 'COMPLETED',
    autonomy,
    snapshot_id: snapshotId,
    findings: observation.findings.length,
    opportunities: observation.opportunities.length,
    health: observation.health.map((h) => ({ area: h.area, state: h.state })),
    actions,
    notes,
    action_states_note:
      'No significant Meta/Instagram writes in this cycle. States: PREPARED / APPROVAL_REQUIRED only unless separately approved.',
    brief_meaningful: brief.meaningful,
  }
}
