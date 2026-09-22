/**
 * Explicit preference learning, confirmation candidates, conflict supersede.
 * Never silently convert model inference into durable preference.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { remember } from '@/lib/jarvis/memory/business-memory'
import { validateMemoryWrite } from '@/lib/jarvis/memory/kinds'
import type { MemoryScope } from '@/lib/jarvis/memory/scopes'

export function extractExplicitPreference(message: string): {
  statement: string
  kind: 'USER_PREFERENCE' | 'OPERATING_RULE'
  scope: MemoryScope
} | null {
  const m = message.trim()
  if (!m) return null

  const rulePatterns = [
    /(?:never|always)\s+(?:increase|change|spend|publish|approve|mix)\b.+/i,
    /do not (?:increase|change|publish|mix)\b.+/i,
    /without (?:asking|approval|my approval)\b.+/i,
  ]
  for (const p of rulePatterns) {
    if (p.test(m) && /(?:never|always|do not|don't|without)/i.test(m)) {
      return {
        statement: m.slice(0, 500),
        kind: 'OPERATING_RULE',
        scope: 'USER_PREFERENCE',
      }
    }
  }

  const prefPatterns = [
    /^remember that\s+(.+)/i,
    /^i (?:prefer|don't like|do not like|hate|love|want|don't want)\s+(.+)/i,
    /please (?:always|never)\s+(.+)/i,
    /(?:never|don't|do not)\s+use\s+(.+)/i,
    /(?:keep|make|use)\s+(?:captions?|zooms?|edits?)\s+(.+)/i,
  ]
  for (const p of prefPatterns) {
    const hit = m.match(p)
    if (hit) {
      const scope: MemoryScope = /zoom/i.test(m)
        ? 'VIDEO_STYLE'
        : 'USER_PREFERENCE'
      return {
        statement: m.slice(0, 500),
        kind: 'USER_PREFERENCE',
        scope,
      }
    }
  }
  return null
}

/**
 * Vague complaints are NOT durable preferences.
 */
export function isVagueComplaint(message: string): boolean {
  const m = message.trim().toLowerCase()
  return /^(i don't like this|this is bad|no|nah|wrong|hate it|not good)[.!]?$/.test(m)
}

export async function storeExplicitPreference(input: {
  statement: string
  kind?: 'USER_PREFERENCE' | 'OPERATING_RULE'
  scope?: MemoryScope
  actorId?: string | null
  supersedeSimilar?: boolean
}): Promise<{ ok: true; id: string; superseded?: string[] } | { ok: false; error: string }> {
  const kind = input.kind ?? 'USER_PREFERENCE'
  const v = validateMemoryWrite({
    kind,
    source: 'user_explicit',
    summary: input.statement,
  })
  if (!v.ok) return { ok: false, error: v.error }

  const superseded: string[] = []
  if (input.supersedeSimilar !== false) {
    const conflicts = await findConflictingPreferences(input.statement)
    for (const c of conflicts) {
      await markMemorySuperseded(c.id)
      superseded.push(c.id)
    }
  }

  const row = await remember({
    category: kind === 'OPERATING_RULE' ? 'business_rule' : 'preference',
    kind,
    title: kind === 'OPERATING_RULE' ? 'Operating rule (user)' : 'User preference',
    summary: input.statement.slice(0, 2000),
    confidence: 'high',
    tags: ['preference', 'user_explicit', kind.toLowerCase()],
    source: 'user_explicit',
    actorId: input.actorId,
    details: {
      memory_kind: kind,
      scope: input.scope ?? 'USER_PREFERENCE',
      evidence_label: 'OBSERVED',
      confirmation: 'explicit',
    },
    scope: input.scope ?? 'USER_PREFERENCE',
    memoryStatus: 'ACTIVE',
  })

  return { ok: true, id: row.id as string, superseded }
}

export async function findConflictingPreferences(statement: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_memory')
    .select('id, title, summary, updated_at, memory_status')
    .eq('category', 'preference')
    .eq('memory_status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(40)

  const tokens = statement
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 3)
  const conflicts: { id: string; summary: string }[] = []
  for (const row of data ?? []) {
    const hay = `${row.title} ${row.summary}`.toLowerCase()
    const overlap = tokens.filter((t) => hay.includes(t)).length
    if (overlap >= 2 && row.summary.trim() !== statement.trim()) {
      conflicts.push({ id: row.id, summary: row.summary })
    }
  }
  return conflicts
}

export async function markMemorySuperseded(id: string, byId?: string) {
  const admin = createAdminClient()
  await admin
    .from('jarvis_memory')
    .update({
      memory_status: 'SUPERSEDED',
      updated_at: new Date().toISOString(),
      ...(byId ? { details: { superseded_by: byId } } : {}),
    })
    .eq('id', id)
}

/**
 * Repeated rejections → confirmation candidate (not auto-stored).
 */
export async function listPreferenceConfirmationCandidates(limit = 5): Promise<
  {
    topic: string
    proposed_preference: string
    evidence_count: number
    ask: string
  }[]
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_memory')
    .select('id, summary, tags, details, created_at')
    .contains('tags', ['rejection_signal'])
    .eq('memory_status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(30)

  const byTopic = new Map<string, string[]>()
  for (const row of data ?? []) {
    const topic =
      (row.details as { topic?: string } | null)?.topic ||
      (Array.isArray(row.tags) ? row.tags.find((t: string) => t !== 'rejection_signal') : null) ||
      'editing'
    const list = byTopic.get(topic) ?? []
    list.push(row.summary)
    byTopic.set(topic, list)
  }

  const out: {
    topic: string
    proposed_preference: string
    evidence_count: number
    ask: string
  }[] = []

  for (const [topic, summaries] of byTopic) {
    if (summaries.length < 3) continue
    const proposed = `Prefer avoiding: ${topic}`
    out.push({
      topic,
      proposed_preference: proposed,
      evidence_count: summaries.length,
      ask: `I've noticed you rejected several items related to "${topic}" (${summaries.length} times). Should I treat "${proposed}" as a standing preference?`,
    })
  }
  return out.slice(0, limit)
}

export async function markStaleMemories(opts?: {
  campaignObservationDays?: number
  maxWrites?: number
}): Promise<{ marked: number }> {
  const days = opts?.campaignObservationDays ?? 30
  const maxWrites = opts?.maxWrites ?? 20
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString()

  const { data } = await admin
    .from('jarvis_memory')
    .select('id, category, scope, memory_status, updated_at')
    .eq('memory_status', 'ACTIVE')
    .in('category', ['outcome', 'insight', 'experiment'])
    .lt('updated_at', cutoff)
    .limit(maxWrites)

  let marked = 0
  for (const row of data ?? []) {
    // Preferences and operating rules are long-lived — skip if mis-tagged
    if (row.scope === 'USER_PREFERENCE') continue
    await admin
      .from('jarvis_memory')
      .update({ memory_status: 'STALE', review_at: new Date().toISOString() })
      .eq('id', row.id)
    marked += 1
  }
  return { marked }
}

export async function listMemoryReviewItems(limit = 30) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_memory')
    .select(
      'id, category, title, summary, confidence, memory_status, scope, scope_id, sample_size, evidence_label, source, created_at, updated_at, details'
    )
    .or('memory_status.in.(STALE,SUPERSEDED),confidence.eq.low')
    .order('updated_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => {
    const details = (row.details as Record<string, unknown>) || {}
    const issues: string[] = []
    if (row.memory_status === 'STALE') issues.push('stale')
    if (row.memory_status === 'SUPERSEDED') issues.push('superseded')
    if (row.confidence === 'low') issues.push('low_confidence')
    if (!row.source || row.source === 'jarvis') issues.push('weak_source')
    if (!(details.evidence as unknown[])?.length && row.category === 'outcome') {
      issues.push('no_evidence')
    }
    return { ...row, review_issues: issues }
  })
}
