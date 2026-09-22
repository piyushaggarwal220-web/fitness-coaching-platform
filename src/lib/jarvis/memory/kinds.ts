/**
 * Phase 1 memory kinds — mapped onto existing jarvis_memory.category values.
 * Do not invent a parallel memory table.
 * Phase 14 extends with OBSERVATION / PATTERN / STRATEGIC_INSIGHT (still same table).
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
  /** Phase 14 hierarchy */
  | 'OBSERVATION'
  | 'PATTERN'
  | 'STRATEGIC_INSIGHT'

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
  OBSERVATION: 'insight',
  PATTERN: 'insight',
  STRATEGIC_INSIGHT: 'insight',
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

const EXPLICIT_KINDS = new Set([
  'BUSINESS_FACT',
  'FACT',
  'USER_PREFERENCE',
  'PREFERENCE',
  'DECISION',
  'ACTION',
  'OUTCOME',
  'LESSON',
  'HYPOTHESIS',
  'OPERATING_RULE',
  'OBSERVATION',
  'PATTERN',
  'STRATEGIC_INSIGHT',
])

export function kindFromRow(row: {
  category?: string | null
  details?: Record<string, unknown> | null
  tags?: string[] | null
}): JarvisMemoryKind {
  const details = row.details && typeof row.details === 'object' ? row.details : {}
  const explicit = details.memory_kind
  if (typeof explicit === 'string' && EXPLICIT_KINDS.has(explicit)) {
    return canonicalizeKind(explicit as JarvisMemoryKind)
  }
  if (row.tags?.includes('strategic_insight') || details.kind === 'strategic_insight') {
    return 'STRATEGIC_INSIGHT'
  }
  if (row.tags?.includes('pattern') || details.kind === 'pattern') return 'PATTERN'
  if (row.tags?.includes('observation') || details.kind === 'observation') return 'OBSERVATION'
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
 * Strategic insights / patterns require evidence thresholds.
 */
export function validateMemoryWrite(input: {
  kind: JarvisMemoryKind
  source?: string | null
  evidence?: string[] | null
  summary: string
}): { ok: true } | { ok: false; error: string } {
  const kind = canonicalizeKind(input.kind)
  const source = input.source?.trim() || ''
  if (kind === 'BUSINESS_FACT' || kind === 'OPERATING_RULE' || kind === 'STRATEGIC_INSIGHT') {
    if (!source || source === 'jarvis' || source === 'model' || source === 'ai') {
      return {
        ok: false,
        error:
          'Facts, operating rules, and strategic insights require an explicit source (config, user, tool, or verified system) — not model invention.',
      }
    }
  }
  if (kind === 'LESSON' || kind === 'OUTCOME' || kind === 'PATTERN' || kind === 'OBSERVATION') {
    const hasEvidence = Boolean(input.evidence?.length)
    const hasSystemSource =
      Boolean(source) && !['jarvis', 'model', 'ai', 'llm'].includes(source.toLowerCase())
    if (!hasEvidence && !hasSystemSource) {
      return {
        ok: false,
        error:
          'Observations/patterns/lessons/outcomes require observed evidence references or a verified system source.',
      }
    }
  }
  if (kind === 'HYPOTHESIS' || kind === 'PATTERN' || kind === 'STRATEGIC_INSIGHT') {
    const lower = input.summary.toLowerCase()
    if (/\b(cause|causes|caused|prove|proves|proven|definitely|guaranteed)\b/.test(lower)) {
      return {
        ok: false,
        error:
          'Hypotheses/patterns/insights must not claim causality. Use language like "may", "associated with", "appears".',
      }
    }
  }
  // External research cannot mint trusted operating rules directly
  if (kind === 'OPERATING_RULE' && /web_research|brave|external_research/i.test(source)) {
    return {
      ok: false,
      error:
        'External research cannot directly create operating rules. Store as HYPOTHESIS/OBSERVATION with EXTERNAL_RESEARCH source.',
    }
  }
  // Security: never accept secret-looking content as memory
  if (
    /\b(api[_-]?key|access[_-]?token|client[_-]?secret|webhook[_-]?secret|password|Bearer\s+[A-Za-z0-9._-]+)\b/i.test(
      input.summary
    )
  ) {
    return { ok: false, error: 'Memory must not contain secrets or credentials.' }
  }
  return { ok: true }
}

/** Phase 14 hierarchy levels (conceptual — stored via memory_kind). */
export type MemoryHierarchyLevel =
  | 0 // RAW FACT
  | 1 // OBSERVATION
  | 2 // PATTERN
  | 3 // HYPOTHESIS
  | 4 // LESSON
  | 5 // OPERATING RULE
  | 6 // STRATEGIC INSIGHT

export function hierarchyLevelForKind(kind: JarvisMemoryKind): MemoryHierarchyLevel {
  switch (canonicalizeKind(kind)) {
    case 'BUSINESS_FACT':
      return 0
    case 'OBSERVATION':
      return 1
    case 'PATTERN':
      return 2
    case 'HYPOTHESIS':
      return 3
    case 'LESSON':
    case 'OUTCOME':
      return 4
    case 'OPERATING_RULE':
    case 'USER_PREFERENCE':
      return 5
    case 'STRATEGIC_INSIGHT':
      return 6
    default:
      return 0
  }
}
