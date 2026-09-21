import { createAdminClient } from '@/lib/supabase/admin'

export async function searchMemory(input: {
  query: string
  category?: string
  funnelId?: string
  limit?: number
}) {
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

  const needle = input.query.toLowerCase()
  const filtered = (data ?? []).filter((row) => {
    const hay = `${row.title} ${row.summary} ${(row.tags || []).join(' ')}`.toLowerCase()
    return hay.includes(needle) || needle.split(/\s+/).some((w) => w.length > 2 && hay.includes(w))
  })

  return filtered.slice(0, input.limit ?? 15)
}

export async function remember(input: {
  category:
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
  title: string
  summary: string
  funnelId?: string
  confidence?: 'low' | 'medium' | 'high'
  tags?: string[]
  details?: Record<string, unknown>
  actorId?: string | null
  source?: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_memory')
    .insert({
      category: input.category,
      title: input.title,
      summary: input.summary.slice(0, 2000),
      funnel_id: input.funnelId ?? null,
      confidence: input.confidence ?? 'medium',
      tags: input.tags ?? [],
      details: input.details ?? {},
      source: input.source ?? 'jarvis',
      created_by: input.actorId ?? null,
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
    .select('id, category, title, summary, funnel_id, confidence, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function listMemory(input?: {
  query?: string
  category?: string
  limit?: number
}) {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_memory')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(input?.limit ?? 80)

  if (input?.category) q = q.eq('category', input.category)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const needle = input?.query?.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) => {
    const hay = `${row.title} ${row.summary} ${(row.tags || []).join(' ')}`.toLowerCase()
    return hay.includes(needle) || needle.split(/\s+/).some((w) => w.length > 2 && hay.includes(w))
  })
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
