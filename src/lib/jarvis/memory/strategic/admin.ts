/**
 * Admin confirm / reject / correct / supersede — audit-friendly, no silent erase.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { remember } from '@/lib/jarvis/memory/business-memory'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'

export type MemoryAdminAction = 'CONFIRM' | 'REJECT' | 'CORRECT' | 'SUPERSEDE'

export async function applyMemoryAdminAction(input: {
  memoryId: string
  action: MemoryAdminAction
  reason: string
  actorId: string
  correctionSummary?: string
}): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const admin = createAdminClient()
  const { data: row } = await admin.from('jarvis_memory').select('*').eq('id', input.memoryId).maybeSingle()
  if (!row) return { ok: false, result: { error: 'not_found' } }

  if (input.action === 'CONFIRM') {
    await admin
      .from('jarvis_memory')
      .update({
        memory_status: 'ACTIVE',
        confidence: row.confidence === 'low' ? 'medium' : row.confidence,
        details: {
          ...(row.details as object),
          admin_confirmed_at: new Date().toISOString(),
          admin_confirmed_by: input.actorId,
          confirm_reason: input.reason,
        },
      })
      .eq('id', input.memoryId)
  } else if (input.action === 'REJECT') {
    await admin
      .from('jarvis_memory')
      .update({
        memory_status: 'ARCHIVED',
        details: {
          ...(row.details as object),
          admin_rejected_at: new Date().toISOString(),
          reject_reason: input.reason,
        },
      })
      .eq('id', input.memoryId)
  } else if (input.action === 'CORRECT' || input.action === 'SUPERSEDE') {
    const next = await remember({
      kind: 'OPERATING_RULE',
      title: `Correction: ${row.title}`,
      summary: (input.correctionSummary || input.reason).slice(0, 2000),
      funnelId: row.funnel_id ?? undefined,
      source: 'USER_EXPLICIT',
      evidence: [`Corrects ${input.memoryId}`, input.reason],
      scope: row.scope ?? 'GLOBAL_BUSINESS',
      scopeId: row.scope_id,
      supersedesId: input.memoryId,
      confidence: 'high',
      actorId: input.actorId,
      tags: ['admin_correction', 'user_explicit'],
      details: {
        corrects_id: input.memoryId,
        prior_summary: row.summary,
      },
    })
    await admin
      .from('jarvis_memory')
      .update({
        memory_status: 'SUPERSEDED',
        details: {
          ...(row.details as object),
          superseded_by: (next as { id?: string })?.id,
          supersede_reason: input.reason,
        },
      })
      .eq('id', input.memoryId)
    await writeMarketingAudit({
      agent: 'admin',
      decision: 'memory_corrected',
      action: input.action,
      actor_id: input.actorId,
      reasoning: input.reason,
      execution_result: { prior: input.memoryId, next: (next as { id?: string })?.id },
    })
    return { ok: true, result: { prior: input.memoryId, next } }
  }

  await writeMarketingAudit({
    agent: 'admin',
    decision: 'memory_admin_action',
    action: input.action,
    actor_id: input.actorId,
    reasoning: input.reason,
    execution_result: { memory_id: input.memoryId },
  })

  return { ok: true, result: { memory_id: input.memoryId, action: input.action } }
}
