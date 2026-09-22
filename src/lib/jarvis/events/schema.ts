/**
 * Zod validation — payloads are DATA, never instructions.
 */

import { z } from 'zod'
import {
  EVENT_PRIORITIES,
  EVENT_SEVERITIES,
  EVENT_SOURCES,
  JARVIS_EVENT_TYPES,
} from '@/lib/jarvis/events/types'

const safeRecord = z.record(z.string(), z.unknown()).default({})

/** Strip / reject instruction-like keys from untrusted payloads. */
const FORBIDDEN_PAYLOAD_KEYS = [
  'execute',
  'run_tool',
  'tool_name',
  'approval_bypass',
  'raise_budget',
  'disable_audit',
  'kill_switch',
  'live_meta',
  'system_prompt',
  'instructions',
]

export function scrubUntrustedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    const lower = k.toLowerCase()
    if (FORBIDDEN_PAYLOAD_KEYS.some((f) => lower.includes(f))) continue
    if (typeof v === 'string' && /ignore previous|system:|you must execute/i.test(v)) {
      out[k] = '[redacted_untrusted_instruction_text]'
      continue
    }
    out[k] = v
  }
  return out
}

export const eventIngestSchema = z.object({
  event_type: z.string().min(1).max(120),
  source: z.enum(EVENT_SOURCES).optional().default('INTERNAL'),
  source_event_id: z.string().max(200).nullable().optional(),
  occurred_at: z.union([z.string(), z.date()]).nullable().optional(),
  system: z
    .enum([
      'META',
      'INSTAGRAM',
      'SHOPIFY',
      'CONTENT',
      'VIDEO',
      'RESEARCH',
      'SYSTEM',
      'BUSINESS',
      'TASK',
      'OTHER',
    ])
    .optional(),
  entity_type: z.string().max(80).nullable().optional(),
  entity_id: z.string().max(200).nullable().optional(),
  funnel_id: z.string().max(80).nullable().optional(),
  severity: z.enum(EVENT_SEVERITIES).optional(),
  payload: safeRecord,
  metadata: safeRecord,
  dry_run: z.boolean().optional(),
  replay: z.boolean().optional(),
})

export type ParsedEventIngest = z.infer<typeof eventIngestSchema>

export function isKnownEventType(t: string): boolean {
  return (JARVIS_EVENT_TYPES as readonly string[]).includes(t)
}

export const eventPrioritySchema = z.enum(EVENT_PRIORITIES)
