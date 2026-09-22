/**
 * Deterministic idempotency keys for external writes.
 */

import { createHash } from 'crypto'
import type { ActionClass, ExecutionSystem } from '@/lib/jarvis/execution/policy/types'

export function buildIdempotencyKey(input: {
  system: ExecutionSystem
  action_class: ActionClass
  tool_name: string
  target_id?: string | null
  logical_op?: string
  decision_id?: string | null
  version?: string | number
  input_fingerprint?: string
}): string {
  const raw = [
    input.system,
    input.action_class,
    input.tool_name,
    input.target_id || '',
    input.logical_op || 'default',
    input.decision_id || '',
    String(input.version ?? '1'),
    input.input_fingerprint || '',
  ].join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 48)
}

export function fingerprintToolInput(input: Record<string, unknown>): string {
  const keys = Object.keys(input).sort()
  const stable: Record<string, unknown> = {}
  for (const k of keys) {
    // skip volatile fields
    if (['timestamp', 'now', 'nonce', 'request_id'].includes(k)) continue
    stable[k] = input[k]
  }
  try {
    return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 24)
  } catch {
    return 'unstable'
  }
}

export function extractTarget(toolName: string, input: Record<string, unknown>): {
  target_type: string | null
  target_id: string | null
} {
  const id =
    (input.adset_id as string) ||
    (input.campaign_id as string) ||
    (input.ad_id as string) ||
    (input.product_id as string) ||
    (input.content_id as string) ||
    (input.media_id as string) ||
    (input.edl_id as string) ||
    (input.job_id as string) ||
    null
  const root = toolName.split('.')[0] || 'unknown'
  return { target_type: id ? root : null, target_id: id }
}
