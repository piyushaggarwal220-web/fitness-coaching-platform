/**
 * Bounded relevance retrieval + conflict detection for jarvis_memory.
 * No embeddings — keyword/tag/category/scope scoring with hard caps.
 *
 * Priority (high → low):
 * 1. Explicit current instruction (caller)
 * 2. Explicit user preference
 * 3. Operating rules
 * 4. Verified facts
 * 5. High-confidence lessons
 * 6. Lower-confidence hypotheses
 * 7. Old/stale memories
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { kindFromRow, type JarvisMemoryKind } from '@/lib/jarvis/memory/kinds'

export type MemoryRow = {
  id: string
  category: string
  title: string
  summary: string
  details: Record<string, unknown>
  funnel_id: string | null
  confidence: string | null
  tags: string[]
  source: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  memory_status?: string | null
  scope?: string | null
  scope_id?: string | null
  sample_size?: number | null
  evidence_label?: string | null
}

export type RetrievedMemory = MemoryRow & {
  kind: JarvisMemoryKind
  relevance_score: number
  expired: boolean
  priority_rank?: number
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'my',
  'our',
  'with',
  'from',
  'what',
  'why',
  'how',
  'did',
  'does',
  'about',
])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9₹$]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t))
}

function isExpired(row: { expires_at?: string | null }): boolean {
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() < Date.now()
}

function kindPriority(kind: JarvisMemoryKind): number {
  switch (kind) {
    case 'USER_PREFERENCE':
    case 'PREFERENCE':
      return 100
    case 'OPERATING_RULE':
      return 90
    case 'STRATEGIC_INSIGHT':
      return 85
    case 'BUSINESS_FACT':
    case 'FACT':
      return 80
    case 'PATTERN':
      return 75
    case 'LESSON':
      return 70
    case 'OBSERVATION':
      return 65
    case 'DECISION':
    case 'ACTION':
    case 'OUTCOME':
      return 60
    case 'HYPOTHESIS':
      return 40
    default:
      return 50
  }
}

function scoreRow(
  query: string,
  row: MemoryRow,
  kind: JarvisMemoryKind,
  opts?: { scope?: string; scopeId?: string | null }
): number {
  const qTokens = tokens(query)
  if (!qTokens.length) return kindPriority(kind) / 100
  const hay = `${row.title} ${row.summary} ${(row.tags || []).join(' ')} ${row.category} ${row.scope || ''}`.toLowerCase()
  let score = 0
  for (const t of qTokens) {
    if (hay.includes(t)) score += t.length >= 5 ? 3 : 2
  }
  // Exact scope boost
  if (opts?.scope && row.scope === opts.scope) score += 5
  if (opts?.scopeId && row.scope_id === opts.scopeId) score += 8
  if (row.funnel_id && opts?.scopeId && row.funnel_id === opts.scopeId) score += 8

  const conf =
    row.confidence === 'high' ? 1.5 : row.confidence === 'medium' ? 1 : row.confidence === 'low' ? 0.5 : 1
  score *= conf
  score += kindPriority(kind) / 20

  if (row.memory_status === 'STALE') score *= 0.25
  if (row.memory_status === 'SUPERSEDED' || row.memory_status === 'ARCHIVED') score *= 0.05
  if (isExpired(row)) score *= 0.1

  // Recency mild boost (max ~2)
  const ageDays = (Date.now() - new Date(row.updated_at).getTime()) / 86400_000
  if (ageDays < 7) score += 2
  else if (ageDays < 30) score += 1

  return score
}

/**
 * Retrieve a small set of relevant memories for a request.
 * Does not dump the full memory table into prompts.
 */
export async function retrieveRelevantMemory(input: {
  query: string
  limit?: number
  kinds?: JarvisMemoryKind[]
  funnelId?: string
  scope?: string
  scopeId?: string | null
  includeExpired?: boolean
  includeStale?: boolean
  /** Current explicit user instruction — always ranked above stored memory. */
  currentInstruction?: string | null
}): Promise<{
  memories: RetrievedMemory[]
  conflicts: MemoryConflict[]
  scanned: number
  current_instruction?: string | null
}> {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 12)
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_memory')
    .select(
      'id, category, title, summary, details, funnel_id, confidence, tags, source, expires_at, created_at, updated_at, memory_status, scope, scope_id, sample_size, evidence_label'
    )
    .order('updated_at', { ascending: false })
    .limit(100)

  if (input.funnelId) q = q.eq('funnel_id', input.funnelId)
  if (!input.includeStale) {
    q = q.not('memory_status', 'in', '("SUPERSEDED","ARCHIVED")')
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as MemoryRow[]
  const scored: RetrievedMemory[] = []
  for (const row of rows) {
    const expired = isExpired(row)
    if (expired && !input.includeExpired) continue
    if (row.memory_status === 'SUPERSEDED' && !input.includeStale) continue
    const kind = kindFromRow(row)
    if (input.kinds?.length && !input.kinds.includes(kind)) continue
    const relevance_score = scoreRow(input.query, row, kind, {
      scope: input.scope,
      scopeId: input.scopeId ?? input.funnelId,
    })
    if (relevance_score <= 0 && tokens(input.query).length > 0) continue
    scored.push({
      ...row,
      details: (row.details as Record<string, unknown>) ?? {},
      tags: row.tags ?? [],
      kind,
      relevance_score,
      expired,
      priority_rank: kindPriority(kind),
    })
  }

  scored.sort((a, b) => {
    const aRank = a.priority_rank ?? 0
    const bRank = b.priority_rank ?? 0
    // Preferences / rules before hypotheses even if keyword score is similar
    if (bRank !== aRank && Math.abs(b.relevance_score - a.relevance_score) < 3) {
      return bRank - aRank
    }
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  const memories = scored.slice(0, limit)
  const conflicts = detectMemoryConflicts(memories)
  return {
    memories,
    conflicts,
    scanned: rows.length,
    current_instruction: input.currentInstruction ?? null,
  }
}

export type MemoryConflict = {
  topic: string
  preferred_id: string
  preferred_summary: string
  discarded_id: string
  discarded_summary: string
  reason: string
}

/**
 * Prefer newer explicit preference, newer verified fact, observed evidence over hypothesis.
 */
export function detectMemoryConflicts(memories: RetrievedMemory[]): MemoryConflict[] {
  const conflicts: MemoryConflict[] = []
  const byTopic = new Map<string, RetrievedMemory[]>()

  for (const m of memories) {
    const topicKey = tokens(m.title)
      .slice(0, 3)
      .join('_')
    if (!topicKey) continue
    const list = byTopic.get(topicKey) ?? []
    list.push(m)
    byTopic.set(topicKey, list)
  }

  for (const [topic, list] of byTopic) {
    if (list.length < 2) continue
    const prefs = list.filter(
      (m) => m.kind === 'USER_PREFERENCE' || m.kind === 'PREFERENCE'
    )
    if (prefs.length >= 2) {
      const sorted = [...prefs].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      const [newer, older] = sorted
      if (newer.summary.trim() !== older.summary.trim()) {
        conflicts.push({
          topic,
          preferred_id: newer.id,
          preferred_summary: newer.summary,
          discarded_id: older.id,
          discarded_summary: older.summary,
          reason: 'Newer explicit user preference preferred over older preference.',
        })
      }
    }

    const facts = list.filter(
      (m) =>
        m.kind === 'BUSINESS_FACT' ||
        m.kind === 'FACT' ||
        m.kind === 'OPERATING_RULE'
    )
    if (facts.length >= 2) {
      const sorted = [...facts].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      const [newer, older] = sorted
      if (newer.summary.trim() !== older.summary.trim()) {
        conflicts.push({
          topic,
          preferred_id: newer.id,
          preferred_summary: newer.summary,
          discarded_id: older.id,
          discarded_summary: older.summary,
          reason: 'Newer verified business fact preferred over older fact.',
        })
      }
    }

    const hyp = list.find((m) => m.kind === 'HYPOTHESIS')
    const lesson = list.find((m) => m.kind === 'LESSON')
    if (hyp && lesson) {
      conflicts.push({
        topic,
        preferred_id: lesson.id,
        preferred_summary: lesson.summary,
        discarded_id: hyp.id,
        discarded_summary: hyp.summary,
        reason: 'Observed lesson preferred over unsupported hypothesis when they conflict.',
      })
    }
  }

  return conflicts.slice(0, 5)
}

/** Prompt-safe compact memory block (no secrets). Lessons inform; rules constrain. */
export function formatMemoryForPrompt(
  memories: RetrievedMemory[],
  conflicts: MemoryConflict[],
  opts?: { currentInstruction?: string | null }
): {
  current_instruction: string | null
  relevant: {
    id: string
    kind: JarvisMemoryKind
    title: string
    summary: string
    source: string | null
    confidence: string | null
    scope?: string | null
    updated_at: string
    role: 'constraint' | 'evidence' | 'preference' | 'context'
  }[]
  conflicts: {
    reason: string
    using: string
    vs: string
  }[]
  planning_note: string
} {
  return {
    current_instruction: opts?.currentInstruction ?? null,
    relevant: memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      summary: m.summary.slice(0, 400),
      source: m.source,
      confidence: m.confidence,
      scope: m.scope,
      updated_at: m.updated_at,
      role:
        m.kind === 'OPERATING_RULE'
          ? 'constraint'
          : m.kind === 'USER_PREFERENCE' || m.kind === 'PREFERENCE'
            ? 'preference'
            : m.kind === 'LESSON' || m.kind === 'HYPOTHESIS'
              ? 'evidence'
              : 'context',
    })),
    conflicts: conflicts.map((c) => ({
      reason: c.reason,
      using: c.preferred_summary.slice(0, 200),
      vs: c.discarded_summary.slice(0, 200),
    })),
    planning_note:
      'Current user instruction overrides stored preferences and lessons for this turn. Operating rules constrain; lessons inform (do not auto-enforce as hard rules). Never claim causality from lessons.',
  }
}

/**
 * Learning-aware planning hints from retrieved memories.
 * Lessons suggest caution; operating rules are hard constraints.
 */
export function planningHintsFromMemory(memories: RetrievedMemory[]): {
  constraints: string[]
  preferences: string[]
  lessons: string[]
  hypotheses: string[]
} {
  const constraints: string[] = []
  const preferences: string[] = []
  const lessons: string[] = []
  const hypotheses: string[] = []
  for (const m of memories) {
    const line = m.summary.slice(0, 240)
    if (m.kind === 'OPERATING_RULE') constraints.push(line)
    else if (m.kind === 'USER_PREFERENCE' || m.kind === 'PREFERENCE') preferences.push(line)
    else if (m.kind === 'LESSON') lessons.push(line)
    else if (m.kind === 'HYPOTHESIS') hypotheses.push(line)
  }
  return {
    constraints: constraints.slice(0, 5),
    preferences: preferences.slice(0, 5),
    lessons: lessons.slice(0, 5),
    hypotheses: hypotheses.slice(0, 3),
  }
}
