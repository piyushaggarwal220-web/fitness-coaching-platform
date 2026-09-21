import { createAdminClient } from '@/lib/supabase/admin'
import type { AutonomyLevel } from '@/lib/ai-marketing/types'

export type AuditEventInput = {
  agent: string
  input_summary?: Record<string, unknown>
  decision?: string | null
  reasoning?: string | null
  confidence?: number | null
  action?: string | null
  autonomy_level?: AutonomyLevel | number | null
  approval?: string | null
  execution_result?: Record<string, unknown> | null
  error?: string | null
  actor_id?: string | null
  related_decision_id?: string | null
  related_action_id?: string | null
}

export async function writeMarketingAudit(event: AuditEventInput): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_audit_events')
    .insert({
      agent: event.agent,
      input_summary: event.input_summary ?? {},
      decision: event.decision ?? null,
      reasoning: event.reasoning ?? null,
      confidence: event.confidence ?? null,
      action: event.action ?? null,
      autonomy_level: event.autonomy_level ?? null,
      approval: event.approval ?? null,
      execution_result: event.execution_result ?? null,
      error: event.error ?? null,
      actor_id: event.actor_id ?? null,
      related_decision_id: event.related_decision_id ?? null,
      related_action_id: event.related_action_id ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[marketing-audit]', error.message)
    return null
  }
  return data?.id ?? null
}
