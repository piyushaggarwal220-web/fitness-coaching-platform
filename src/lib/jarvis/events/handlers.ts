/**
 * Event handlers — OBSERVE / INVESTIGATE / ALERT only.
 * Never bypass Phase 12: all tools go through runTool.
 */

import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { runTool } from '@/lib/jarvis/core/action-runner'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { getEventDefinition } from '@/lib/jarvis/events/registry'
import type { StoredJarvisEvent } from '@/lib/jarvis/events/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { attentionFingerprint } from '@/lib/jarvis/autonomous/fingerprint'
import { upsertAttentionItems } from '@/lib/jarvis/autonomous/store'
import type { AttentionItem } from '@/lib/jarvis/autonomous/types'

export type HandlerOutcome = {
  status: string
  result: Record<string, unknown>
  error?: string
  set_cooldown?: boolean
}

function isDry(ev: StoredJarvisEvent): boolean {
  return Boolean(ev.metadata?.dry_run || ev.metadata?.replay)
}

export async function dispatchEventAction(ev: StoredJarvisEvent): Promise<HandlerOutcome> {
  ensureJarvisToolsRegistered()
  const def = getEventDefinition(ev.event_type)
  const dry = isDry(ev)
  const significance = ev.significance || def.significance_default

  if (significance === 'IGNORE' || significance === 'LOG') {
    return {
      status: 'COMPLETED',
      result: { handled: true, mode: 'log_only', significance },
    }
  }

  if (dry) {
    return {
      status: 'COMPLETED',
      result: {
        handled: true,
        mode: 'DRY_RUN',
        would: def.default_action,
        significance,
        note: 'Replay/dry-run — no investigation spend, no external writes.',
      },
    }
  }

  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    await createAdminClient().from('jarvis_tasks').insert({
      objective: `Event ${ev.event_type}`,
      status: 'paused_budget',
      source: 'event',
      error: gate.reason,
      completed_at: new Date().toISOString(),
    })
    return {
      status: 'DEFERRED',
      result: { reason: 'INVESTIGATION_DEFERRED_BUDGET', detail: gate.reason },
      set_cooldown: false,
    }
  }

  const ctx = {
    actorId: null as string | null,
    conversationId: null as string | null,
    taskId: null as string | null,
    source: 'event' as const,
  }

  // Phase 14 — event contributes OBSERVATION evidence (event ≠ pattern)
  if (['INVESTIGATE', 'ALERT', 'URGENT'].includes(significance) && !dry) {
    try {
      const { recordEventAsObservation } = await import('@/lib/jarvis/memory/strategic/synthesis')
      await recordEventAsObservation({
        eventId: ev.id,
        eventType: ev.event_type,
        funnelId: ev.funnel_id,
        significance,
        reason: ev.significance_reason || def.default_action,
        metric: typeof ev.payload?.metric === 'string' ? ev.payload.metric : null,
        before: typeof ev.payload?.before === 'number' ? ev.payload.before : null,
        after: typeof ev.payload?.after === 'number' ? ev.payload.after : null,
      })
    } catch {
      /* strategic write optional if migration pending */
    }
  }

  // Attention for ALERT / URGENT / INVESTIGATE
  if (['INVESTIGATE', 'ALERT', 'URGENT'].includes(significance)) {
    const item: AttentionItem = {
      fingerprint: attentionFingerprint({
        system: ev.system || 'OTHER',
        title: `Event: ${ev.event_type}`,
        key: ev.entity_id || ev.funnel_id || ev.fingerprint || 'none',
      }),
      severity:
        ev.severity === 'CRITICAL'
          ? 'CRITICAL'
          : ev.severity === 'WARNING'
            ? 'WARNING'
            : 'NOTICE',
      system: ev.system || 'OTHER',
      title: `Event: ${ev.event_type}`,
      observation: ev.significance_reason || def.default_action,
      evidence: [
        `source=${ev.source}`,
        `fingerprint=${ev.fingerprint}`,
        ev.funnel_id ? `funnel=${ev.funnel_id}` : 'funnel=UNCLASSIFIED',
      ],
      next_action: def.investigation_pattern
        ? `Investigate via pattern ${def.investigation_pattern}`
        : 'Review in Command Center',
      requires_approval: true,
      status: 'open',
    }
    await upsertAttentionItems([item])
  }

  // Notifications (dedupe via existing patterns when possible)
  if (def.notification === 'NOTIFY' || def.notification === 'URGENT_NOTIFY') {
    await createAdminClient().from('jarvis_notifications').insert({
      kind: def.notification === 'URGENT_NOTIFY' ? 'critical' : 'activity',
      title: `Jarvis event: ${ev.event_type}`,
      body: (ev.significance_reason || '').slice(0, 280),
      link: '/admin/jarvis',
      metadata: { event_id: ev.id, fingerprint: ev.fingerprint },
    })
  }

  let result: Record<string, unknown> = { handled: true, significance }

  // Legacy + investigation paths — always runTool
  if (ev.event_type === 'meta.sync_completed') {
    const creative = await runTool('creatives.performance', { days: 14 }, ctx)
    result = { ...result, creative: creative.status }
  } else if (ev.event_type === 'video.uploaded') {
    const source = String(ev.payload?.source_video || '')
    if (source) {
      const job = await runTool(
        'video.create_edit_job',
        { sourceVideo: source, instructions: { hooks: ['opening hook'] } },
        ctx
      )
      result = { ...result, video: job.status, summary: job.summary }
    } else {
      result = { ...result, handled: false, reason: 'missing source_video' }
    }
  } else if (
    significance === 'INVESTIGATE' ||
    significance === 'ALERT' ||
    significance === 'URGENT' ||
    ev.event_type === 'funnel.conversion_drop'
  ) {
    const question =
      typeof ev.payload?.question === 'string'
        ? ev.payload.question
        : `Investigate ${ev.event_type}${ev.funnel_id ? ` for funnel ${ev.funnel_id}` : ''}`
    const inv = await runTool(
      'analytics.investigate',
      {
        question: String(question).slice(0, 400),
        ...(def.investigation_pattern ? { pattern_id: def.investigation_pattern } : {}),
      },
      ctx
    )
    result = { ...result, investigate: inv.status, summary: inv.summary }
  } else if (ev.event_type === 'experiment.completed') {
    result = {
      ...result,
      note: 'Experiment completion recorded — evaluate via experiments UI / memory.',
    }
  } else if (significance === 'DIGEST') {
    result = { ...result, mode: 'digest_only' }
  }

  return {
    status: 'COMPLETED',
    result,
    set_cooldown: ['INVESTIGATE', 'ALERT', 'URGENT'].includes(significance),
  }
}
