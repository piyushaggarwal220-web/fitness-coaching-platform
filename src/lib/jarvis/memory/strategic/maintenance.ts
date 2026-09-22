/**
 * Bounded strategic memory maintenance — never silent history erase.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { scanConflictsAmong, persistConflict } from '@/lib/jarvis/memory/strategic/conflicts'
import type { MemoryRow } from '@/lib/jarvis/memory/retrieval'

export async function runStrategicMemoryMaintenance(): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const staleBefore = new Date(Date.now() - 90 * 86400_000).toISOString()

  // Mark old ACTIVE performance-ish memories STALE (not delete)
  const { data: aged } = await admin
    .from('jarvis_memory')
    .select('id')
    .eq('memory_status', 'ACTIVE')
    .lt('updated_at', staleBefore)
    .or('category.eq.outcome,tags.cs.{pattern,lesson}')
    .limit(50)

  let markedStale = 0
  for (const row of aged ?? []) {
    await admin.from('jarvis_memory').update({ memory_status: 'STALE' }).eq('id', row.id)
    markedStale += 1
  }

  const { data: active } = await admin
    .from('jarvis_memory')
    .select('*')
    .eq('memory_status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(40)

  const conflicts = await scanConflictsAmong((active ?? []) as MemoryRow[])
  let persisted = 0
  for (const c of conflicts.slice(0, 10)) {
    const id = await persistConflict(c)
    if (id) persisted += 1
  }

  const health = await getStrategicMemoryHealth()

  return {
    marked_stale: markedStale,
    conflicts_detected: conflicts.length,
    conflicts_persisted: persisted,
    health,
    note: 'Maintenance never deletes meaningful history — only status transitions.',
  }
}

export async function getStrategicMemoryHealth(): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const statuses = ['ACTIVE', 'STALE', 'SUPERSEDED', 'ARCHIVED', 'CONFLICTED'] as const
  const counts: Record<string, number> = {}
  for (const s of statuses) {
    const { count } = await admin
      .from('jarvis_memory')
      .select('id', { count: 'exact', head: true })
      .eq('memory_status', s)
    counts[s.toLowerCase()] = count ?? 0
  }
  const { count: total } = await admin.from('jarvis_memory').select('id', { count: 'exact', head: true })
  const { count: lowConf } = await admin
    .from('jarvis_memory')
    .select('id', { count: 'exact', head: true })
    .eq('confidence', 'low')
    .eq('memory_status', 'ACTIVE')
  const { count: openConflicts } = await admin
    .from('jarvis_memory_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')

  return {
    total: total ?? 0,
    ...counts,
    low_confidence_active: lowConf ?? 0,
    unresolved_conflicts: openConflicts ?? 0,
    note: 'Phase 14 memory health — jarvis_memory remains the store of record.',
  }
}
