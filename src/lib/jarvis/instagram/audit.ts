import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { redactSecrets } from '@/lib/jarvis/operator-errors'
import type { InstagramAuditRecord } from '@/lib/jarvis/instagram/types'

/** In-memory audit sink for unit tests (never stores secrets). */
const testAuditSink: InstagramAuditRecord[] = []

export function resetInstagramAuditSinkForTests(): void {
  testAuditSink.length = 0
}

export function getInstagramAuditSinkForTests(): InstagramAuditRecord[] {
  return [...testAuditSink]
}

/**
 * Every Instagram Graph/action path should call this.
 * Never stores API secrets — errors are redacted.
 */
export async function writeInstagramAudit(input: {
  action: string
  target: string | null
  actor: string | null
  approval_state: string | null
  result: string
  provider_response_status: number | null
  error_redacted?: string | null
  extra?: Record<string, unknown>
}): Promise<InstagramAuditRecord> {
  const record: InstagramAuditRecord = {
    action: input.action,
    target: input.target,
    actor: input.actor,
    approval_state: input.approval_state,
    result: input.result,
    provider_response_status: input.provider_response_status,
    timestamp: new Date().toISOString(),
    error_redacted: input.error_redacted
      ? redactSecrets(input.error_redacted).slice(0, 400)
      : null,
  }

  testAuditSink.push(record)

  try {
    await writeMarketingAudit({
      agent: 'instagram',
      decision: input.action,
      action: input.action,
      approval: input.approval_state,
      actor_id: input.actor && input.actor !== 'jarvis' ? input.actor : null,
      error: record.error_redacted,
      execution_result: {
        target: input.target,
        result: input.result,
        provider_response_status: input.provider_response_status,
        timestamp: record.timestamp,
        ...(input.extra ?? {}),
      },
    })
  } catch {
    // Audit persistence failure must not break the operator path.
  }

  return record
}
