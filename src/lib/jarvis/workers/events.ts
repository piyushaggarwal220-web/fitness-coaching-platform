import { createAdminClient } from '@/lib/supabase/admin'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { runTool } from '@/lib/jarvis/core/action-runner'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'

/**
 * Lightweight event bus for Jarvis — store event, process once, no polling loops.
 */
export async function emitJarvisEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_events')
    .insert({
      event_type: eventType,
      payload,
      status: 'pending',
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[jarvis-events] emit failed', error.message)
    return null
  }
  return data?.id ?? null
}

export async function processPendingJarvisEvents(limit = 10): Promise<{
  processed: number
  results: Record<string, unknown>[]
}> {
  ensureJarvisToolsRegistered()
  const admin = createAdminClient()
  const { data: events } = await admin
    .from('jarvis_events')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  const results: Record<string, unknown>[] = []
  let processed = 0

  for (const ev of events ?? []) {
    await admin
      .from('jarvis_events')
      .update({ status: 'processing' })
      .eq('id', ev.id)

    try {
      const gate = await assertAiBudgetAvailable(0.05)
      if (!gate.ok) {
        await admin
          .from('jarvis_events')
          .update({
            status: 'skipped',
            error: gate.reason,
            processed_at: new Date().toISOString(),
            result: { reason: 'paused_budget' },
          })
          .eq('id', ev.id)
        await admin.from('jarvis_tasks').insert({
          objective: `Event ${ev.event_type}`,
          status: 'paused_budget',
          source: 'event',
          error: gate.reason,
          completed_at: new Date().toISOString(),
        })
        results.push({ id: ev.id, skipped: true, reason: gate.reason })
        continue
      }

      const ctx = {
        actorId: null as string | null,
        conversationId: null as string | null,
        taskId: null as string | null,
        source: 'event' as const,
      }

      let result: Record<string, unknown> = { handled: false }

      if (ev.event_type === 'meta.sync_completed') {
        const creative = await runTool('creatives.performance', { days: 14 }, ctx)
        result = { handled: true, creative: creative.status }
      } else if (ev.event_type === 'video.uploaded') {
        const source = String((ev.payload as { source_video?: string })?.source_video || '')
        if (source) {
          const job = await runTool(
            'video.create_edit_job',
            { sourceVideo: source, instructions: { hooks: ['opening hook'] } },
            ctx
          )
          result = { handled: true, video: job.status, summary: job.summary }
        } else {
          result = { handled: false, reason: 'missing source_video' }
        }
      } else if (ev.event_type === 'funnel.conversion_drop') {
        const inv = await runTool(
          'analytics.investigate',
          {
            question: String(
              (ev.payload as { question?: string })?.question ||
                'Why did conversion drop?'
            ),
          },
          ctx
        )
        result = { handled: true, investigate: inv.status }
      } else if (ev.event_type === 'experiment.completed') {
        result = {
          handled: true,
          note: 'Experiment completion recorded — evaluate via AI Marketing experiments UI / memory.',
        }
        await admin.from('jarvis_notifications').insert({
          kind: 'activity',
          title: 'Experiment completed',
          body: JSON.stringify(ev.payload).slice(0, 300),
          link: '/admin/ai-marketing',
        })
      } else {
        result = { handled: false, reason: `No handler for ${ev.event_type}` }
      }

      await admin
        .from('jarvis_events')
        .update({
          status: 'processed',
          result,
          processed_at: new Date().toISOString(),
        })
        .eq('id', ev.id)
      processed += 1
      results.push({ id: ev.id, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Event processing failed'
      await admin
        .from('jarvis_events')
        .update({
          status: 'failed',
          error: message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', ev.id)
      results.push({ id: ev.id, error: message })
    }
  }

  return { processed, results }
}
