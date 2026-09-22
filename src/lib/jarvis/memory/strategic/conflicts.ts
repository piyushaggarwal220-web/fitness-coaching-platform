/**
 * Conflict detection + preservation — never silently overwrite.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { kindFromRow } from '@/lib/jarvis/memory/kinds'
import type { MemoryRow } from '@/lib/jarvis/memory/retrieval'

export type MemoryConflictRecord = {
  id?: string
  memory_a_id: string
  memory_b_id: string
  reason: string
  status: 'open' | 'resolved' | 'dismissed'
  funnel_id: string | null
}

function oppositeDirection(a: string, b: string): boolean {
  const up = /\b(increase|higher|up|better|improved|grew)\b/i
  const down = /\b(decrease|lower|down|worse|deteriorat|drop|hurt)\b/i
  return (up.test(a) && down.test(b)) || (down.test(a) && up.test(b))
}

export function detectStatementConflict(
  a: { id: string; summary: string; funnel_id?: string | null; tags?: string[] },
  b: { id: string; summary: string; funnel_id?: string | null; tags?: string[] }
): MemoryConflictRecord | null {
  if (a.id === b.id) return null
  // Cross-funnel: not a conflict — different scopes
  if (a.funnel_id && b.funnel_id && a.funnel_id !== b.funnel_id) return null

  const sameTopic =
    a.tags?.some((t) => b.tags?.includes(t) && t.startsWith('funnel:')) ||
    a.summary.toLowerCase().split(/\s+/).filter((w) => w.length > 5).some((w) => b.summary.toLowerCase().includes(w))

  if (!sameTopic) return null
  if (!oppositeDirection(a.summary, b.summary)) return null

  return {
    memory_a_id: a.id,
    memory_b_id: b.id,
    reason: 'Opposite directional claims under similar topic/scope — preserve both until resolved.',
    status: 'open',
    funnel_id: a.funnel_id ?? b.funnel_id ?? null,
  }
}

export async function persistConflict(conflict: MemoryConflictRecord): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_memory_conflicts')
    .upsert(
      {
        memory_a_id: conflict.memory_a_id,
        memory_b_id: conflict.memory_b_id,
        reason: conflict.reason,
        status: conflict.status,
        funnel_id: conflict.funnel_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'memory_a_id,memory_b_id' }
    )
    .select('id')
    .maybeSingle()
  if (error) {
    // Mark rows CONFLICTED even if conflict table missing
    await admin
      .from('jarvis_memory')
      .update({ memory_status: 'CONFLICTED' })
      .in('id', [conflict.memory_a_id, conflict.memory_b_id])
    return null
  }
  await admin
    .from('jarvis_memory')
    .update({ memory_status: 'CONFLICTED' })
    .in('id', [conflict.memory_a_id, conflict.memory_b_id])
  return data?.id ?? null
}

export async function listOpenConflicts(limit = 20): Promise<MemoryConflictRecord[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_memory_conflicts')
    .select('*')
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []).map((r) => ({
    id: String(r.id),
    memory_a_id: String(r.memory_a_id),
    memory_b_id: String(r.memory_b_id),
    reason: String(r.reason),
    status: r.status as 'open',
    funnel_id: (r.funnel_id as string) ?? null,
  }))
}

export async function scanConflictsAmong(rows: MemoryRow[]): Promise<MemoryConflictRecord[]> {
  const found: MemoryConflictRecord[] = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const c = detectStatementConflict(
        {
          id: rows[i].id,
          summary: rows[i].summary,
          funnel_id: rows[i].funnel_id,
          tags: rows[i].tags,
        },
        {
          id: rows[j].id,
          summary: rows[j].summary,
          funnel_id: rows[j].funnel_id,
          tags: rows[j].tags,
        }
      )
      if (c) found.push(c)
    }
  }
  return found
}

export function explainConflict(c: MemoryConflictRecord): string {
  return `Conflict between ${c.memory_a_id.slice(0, 8)} and ${c.memory_b_id.slice(0, 8)}: ${c.reason}${
    c.funnel_id ? ` (funnel=${c.funnel_id})` : ' (scope may be global/unclassified)'
  }. Both retained — do not silently pick one.`
}

/** Kind-aware: lesson vs hypothesis is not always a conflict */
export function kindsCompatibleForConflict(a: MemoryRow, b: MemoryRow): boolean {
  const ka = kindFromRow(a)
  const kb = kindFromRow(b)
  if (ka === 'USER_PREFERENCE' || kb === 'USER_PREFERENCE') return true
  if (ka === 'OPERATING_RULE' || kb === 'OPERATING_RULE') return true
  if (ka === 'LESSON' || kb === 'LESSON' || ka === 'PATTERN' || kb === 'PATTERN') return true
  return false
}
