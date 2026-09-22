/**
 * Execution incidents — fingerprint dedupe.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export function executionIncidentFingerprint(input: {
  system: string
  toolName: string
  targetId?: string | null
  errorClass: string
}): string {
  return createHash('sha256')
    .update([input.system, input.toolName, input.targetId || '', input.errorClass].join('|'))
    .digest('hex')
    .slice(0, 32)
}

export async function recordExecutionIncident(input: {
  fingerprint: string
  system: string
  toolName: string
  targetId?: string | null
  errorClass: string
  message: string
  receiptId?: string | null
  recommendedNext?: string
}): Promise<{ id: string; deduped: boolean }> {
  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('jarvis_execution_incidents')
      .select('id, occurrence_count')
      .eq('fingerprint', input.fingerprint)
      .eq('status', 'open')
      .maybeSingle()

    if (existing?.id) {
      await admin
        .from('jarvis_execution_incidents')
        .update({
          occurrence_count: Number(existing.occurrence_count || 1) + 1,
          last_seen_at: new Date().toISOString(),
          message: input.message.slice(0, 500),
          receipt_id: input.receiptId ?? null,
        })
        .eq('id', existing.id)
      return { id: existing.id as string, deduped: true }
    }

    const { data, error } = await admin
      .from('jarvis_execution_incidents')
      .insert({
        fingerprint: input.fingerprint,
        system: input.system,
        tool_name: input.toolName,
        target_id: input.targetId ?? null,
        error_class: input.errorClass,
        message: input.message.slice(0, 500),
        receipt_id: input.receiptId ?? null,
        recommended_next: input.recommendedNext ?? null,
        status: 'open',
      })
      .select('id')
      .maybeSingle()

    if (error || !data) return { id: 'local', deduped: false }
    return { id: data.id as string, deduped: false }
  } catch {
    return { id: 'local', deduped: false }
  }
}
