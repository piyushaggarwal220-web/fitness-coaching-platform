/**
 * Phase 1 memory kinds — mapped onto existing jarvis_memory.category values.
 * Do not invent a parallel memory table.
 */

import type { MemoryCategory } from '@/lib/jarvis/operator-present'

export type JarvisMemoryKind =
  | 'BUSINESS_FACT'
  | 'FACT' // alias → BUSINESS_FACT
  | 'USER_PREFERENCE'
  | 'PREFERENCE' // alias → USER_PREFERENCE
  | 'DECISION'
  | 'ACTION'
  | 'OUTCOME'
  | 'LESSON'
  | 'HYPOTHESIS'
  | 'OPERATING_RULE'

export const MEMORY_KIND_TO_CATEGORY: Record<JarvisMemoryKind, MemoryCategory> = {
  BUSINESS_FACT: 'funnel_economics',
  FACT: 'funnel_economics',
  USER_PREFERENCE: 'preference',
  PREFERENCE: 'preference',
  DECISION: 'decision',
  ACTION: 'decision',
  OUTCOME: 'outcome',
  LESSON: 'outcome',
  HYPOTHESIS: 'insight',
  OPERATING_RULE: 'business_rule',
}

/** Normalize aliases to canonical kinds. */
export function canonicalizeKind(kind: JarvisMemoryKind): JarvisMemoryKind {
  if (kind === 'FACT') return 'BUSINESS_FACT'
  if (kind === 'PREFERENCE') return 'USER_PREFERENCE'
  return kind
}

export function categoryForKind(kind: JarvisMemoryKind): MemoryCategory {
  return MEMORY_KIND_TO_CATEGORY[canonicalizeKind(kind)]
}

export function kindFromRow(row: {
  category?: string | null
  details?: Record<string, unknown> | null
  tags?: string[] | null
}): JarvisMemoryKind {
  const details = row.details && typeof row.details === 'object' ? row.details : {}
  const explicit = details.memory_kind
  if (
    explicit === 'BUSINESS_FACT' ||
    explicit === 'FACT' ||
    explicit === 'USER_PREFERENCE' ||
    explicit === 'PREFERENCE' ||
    explicit === 'DECISION' ||
    explicit === 'ACTION' ||
    explicit === 'OUTCOME' ||
    explicit === 'LESSON' ||
    explicit === 'HYPOTHESIS' ||
    explicit === 'OPERATING_RULE'
  ) {
    return canonicalizeKind(explicit as JarvisMemoryKind)
  }
  if (row.tags?.includes('hypothesis') || details.kind === 'hypothesis') return 'HYPOTHESIS'
  if (row.tags?.includes('operating_rule') || details.kind === 'operating_rule') {
    return 'OPERATING_RULE'
  }
  if (row.tags?.includes('action') || details.record_type === 'ACTION') return 'ACTION'
  if (row.tags?.includes('outcome_record') || details.record_type === 'OUTCOME') return 'OUTCOME'
  switch (row.category) {
    case 'preference':
      return 'USER_PREFERENCE'
    case 'decision':
      return 'DECISION'
    case 'outcome':
      return details.record_type === 'OUTCOME' ? 'OUTCOME' : 'LESSON'
    case 'insight':
      return 'HYPOTHESIS'
    case 'funnel_economics':
    case 'audience':
    case 'creative':
      return 'BUSINESS_FACT'
    case 'business_rule':
      return 'OPERATING_RULE'
    default:
      return 'BUSINESS_FACT'
  }
}

/**
 * Facts require a non-jarvis-hallucination source.
 * Lessons require observed evidence.
 * Hypotheses must stay labeled as hypotheses.
 */
export function validateMemoryWrite(input: {
  kind: JarvisMemoryKind
  source?: string | null
  evidence?: string[] | null
  summary: string
}): { ok: true } | { ok: false; error: string } {
  const kind = canonicalizeKind(input.kind)
  const source = input.source?.trim() || ''
  if (kind === 'BUSINESS_FACT' || kind === 'OPERATING_RULE') {
    if (!source || source === 'jarvis' || source === 'model' || source === 'ai') {
      return {
        ok: false,
        error:
          'Facts and operating rules require an explicit source (config, user, tool, or verified system) — not model invention.',
      }
    }
  }
  if (kind === 'LESSON' || kind === 'OUTCOME') {
    const hasEvidence = Boolean(input.evidence?.length)
    const hasSystemSource =
      Boolean(source) && !['jarvis', 'model', 'ai', 'llm'].includes(source.toLowerCase())
    if (!hasEvidence && !hasSystemSource) {
      return {
        ok: false,
        error:
          'Lessons/outcomes require observed evidence references (outcome, metric change, or tool result) or a verified system source.',
      }
    }
  }
  if (kind === 'HYPOTHESIS') {
    const lower = input.summary.toLowerCase()
    if (/\b(causes|caused|proves|proven|definitely)\b/.test(lower)) {
      return {
        ok: false,
        error:
          'Hypotheses must not claim causality. Use language like "may", "possible contributor", "associated with".',
      }
    }
  }
  // Security: never accept secret-looking content as memory
  if (/\b(api[_-]?key|access[_-]?token|client[_-]?secret|webhook[_-]?secret|password|Bearer\s+[A-Za-z0-9._-]+)\b/i.test(input.summary)) {
    return { ok: false, error: 'Memory must not contain secrets or credentials.' }
  }
  return { ok: true }
}
