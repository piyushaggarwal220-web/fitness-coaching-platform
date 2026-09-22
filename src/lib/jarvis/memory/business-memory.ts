import { createAdminClient } from '@/lib/supabase/admin'
import {
  categoryForKind,
  canonicalizeKind,
  validateMemoryWrite,
  type JarvisMemoryKind,
} from '@/lib/jarvis/memory/kinds'
import { retrieveRelevantMemory } from '@/lib/jarvis/memory/retrieval'

export async function searchMemory(input: {
  query: string
  category?: string
  funnelId?: string
  limit?: number
}) {
  // Prefer relevance retrieval; fall back to category filter when query empty
  if (input.query.trim()) {
    const { memories } = await retrieveRelevantMemory({
      query: input.query,
      limit: input.limit ?? 15,
      funnelId: input.funnelId,
    })
    if (input.category) {
      return memories.filter((m) => m.category === input.category)
    }
    return memories
  }

  const admin = createAdminClient()
  let q = admin
    .from('jarvis_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(input.limit ?? 15)

  if (input.category) q = q.eq('category', input.category)
  if (input.funnelId) q = q.eq('funnel_id', input.funnelId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function remember(input: {
  category?:
    | 'business_rule'
    | 'funnel_economics'
    | 'experiment'
    | 'creative'
    | 'audience'
    | 'research'
    | 'decision'
    | 'outcome'
    | 'preference'
    | 'insight'
  /** Phase 1/3 kind — preferred when provided. */
  kind?: JarvisMemoryKind
  title: string
  summary: string
  funnelId?: string
  confidence?: 'low' | 'medium' | 'high'
  tags?: string[]
  details?: Record<string, unknown>
  actorId?: string | null
  source?: string
  evidence?: string[]
  expiresAt?: string | null
  scope?: string
  scopeId?: string | null
  memoryStatus?: 'ACTIVE' | 'STALE' | 'SUPERSEDED' | 'ARCHIVED'
  sampleSize?: number | null
  evidenceLabel?: string | null
  reviewAt?: string | null
  supersedesId?: string | null
}) {
  const rawKind: JarvisMemoryKind =
    input.kind ||
    (input.category === 'preference'
      ? 'USER_PREFERENCE'
      : input.category === 'decision'
        ? 'DECISION'
        : input.category === 'outcome'
          ? 'LESSON'
          : input.category === 'insight'
            ? 'HYPOTHESIS'
            : input.category === 'business_rule'
              ? 'OPERATING_RULE'
              : 'BUSINESS_FACT')
  const kind = canonicalizeKind(rawKind)

  const validation = validateMemoryWrite({
    kind,
    source: input.source,
    evidence: input.evidence ?? (input.details?.evidence as string[] | undefined),
    summary: input.summary,
  })
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const category = input.category ?? categoryForKind(kind)
  const tags = [...(input.tags ?? [])]
  if (kind === 'HYPOTHESIS' && !tags.includes('hypothesis')) tags.push('hypothesis')
  if (kind === 'OPERATING_RULE' && !tags.includes('operating_rule')) tags.push('operating_rule')
  if (kind === 'LESSON' && !tags.includes('lesson')) tags.push('lesson')
  if (kind === 'OUTCOME' && !tags.includes('outcome_record')) tags.push('outcome_record')
  if (kind === 'ACTION' && !tags.includes('action')) tags.push('action')

  const scope =
    input.scope ??
    (typeof input.details?.scope === 'string' ? input.details.scope : 'GLOBAL_BUSINESS')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_memory')
    .insert({
      category,
      title: input.title,
      summary: input.summary.slice(0, 2000),
      funnel_id: input.funnelId ?? null,
      confidence: input.confidence ?? 'medium',
      tags,
      details: {
        ...(input.details ?? {}),
        memory_kind: kind,
        evidence: input.evidence ?? input.details?.evidence ?? [],
        scope,
        scope_id: input.scopeId ?? input.details?.scope_id ?? null,
      },
      source: input.source ?? 'jarvis',
      created_by: input.actorId ?? null,
      expires_at: input.expiresAt ?? null,
      memory_status: input.memoryStatus ?? 'ACTIVE',
      scope,
      scope_id: input.scopeId ?? null,
      sample_size: input.sampleSize ?? null,
      evidence_label: input.evidenceLabel ?? null,
      review_at: input.reviewAt ?? null,
      supersedes_id: input.supersedesId ?? null,
    })
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function recentMemorySummaries(limit = 12) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_memory')
    .select('id, category, title, summary, funnel_id, confidence, created_at, source, details')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function listMemory(input?: {
  query?: string
  category?: string
  limit?: number
}) {
  if (input?.query?.trim()) {
    const { memories } = await retrieveRelevantMemory({
      query: input.query,
      limit: input.limit ?? 80,
    })
    if (input.category) return memories.filter((m) => m.category === input.category)
    return memories
  }

  const admin = createAdminClient()
  let q = admin
    .from('jarvis_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(input?.limit ?? 80)

  if (input?.category) q = q.eq('category', input.category)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function updateMemory(input: {
  id: string
  title?: string
  summary?: string
  category?: string
  confidence?: 'low' | 'medium' | 'high'
  tags?: string[]
}) {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title != null) patch.title = input.title
  if (input.summary != null) patch.summary = input.summary.slice(0, 2000)
  if (input.category != null) patch.category = input.category
  if (input.confidence != null) patch.confidence = input.confidence
  if (input.tags != null) patch.tags = input.tags
  const { data, error } = await admin
    .from('jarvis_memory')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function forgetMemory(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('jarvis_memory').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}
