/**
 * Take / near-duplicate detection from transcripts (honest about basis).
 */

import { createAdminClient } from '@/lib/supabase/admin'

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length > 2)
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export async function detectTakeGroups(sessionId: string) {
  const admin = createAdminClient()
  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('id, checksum_sha256')
    .eq('session_id', sessionId)

  const groups: {
    source_ids: string[]
    similarity: number
    confidence: 'low' | 'medium' | 'high'
    similarity_basis: 'exact_hash' | 'transcript'
    note: string
  }[] = []

  // Exact hash duplicates
  const byHash = new Map<string, string[]>()
  for (const s of sources ?? []) {
    if (!s.checksum_sha256) continue
    const list = byHash.get(s.checksum_sha256) ?? []
    list.push(s.id)
    byHash.set(s.checksum_sha256, list)
  }
  for (const [, ids] of byHash) {
    if (ids.length >= 2) {
      groups.push({
        source_ids: ids,
        similarity: 1,
        confidence: 'high',
        similarity_basis: 'exact_hash',
        note: 'Exact byte-identical uploads',
      })
    }
  }

  // Transcript similarity
  const sourceIds = (sources ?? []).map((s) => s.id)
  if (sourceIds.length >= 2) {
    const { data: txs } = await admin
      .from('jarvis_video_transcripts')
      .select('source_id, full_text')
      .in('source_id', sourceIds)
      .eq('status', 'COMPLETED')

    const texts = (txs ?? []).filter((t) => t.full_text?.trim())
    const used = new Set<string>()
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]!
        const b = texts[j]!
        const sim = jaccard(tokenize(a.full_text), tokenize(b.full_text))
        if (sim >= 0.72) {
          const key = [a.source_id, b.source_id].sort().join(':')
          if (used.has(key)) continue
          used.add(key)
          // Skip if already exact-hash grouped
          const exact = groups.some(
            (g) =>
              g.similarity_basis === 'exact_hash' &&
              g.source_ids.includes(a.source_id) &&
              g.source_ids.includes(b.source_id)
          )
          if (exact) continue
          groups.push({
            source_ids: [a.source_id, b.source_id],
            similarity: Number(sim.toFixed(3)),
            confidence: sim >= 0.9 ? 'high' : 'medium',
            similarity_basis: 'transcript',
            note: 'Transcript similarity only — visual/audio similarity not established',
          })
        }
      }
    }
  }

  // Replace prior take groups for session
  await admin.from('jarvis_video_take_groups').delete().eq('session_id', sessionId)
  if (groups.length) {
    await admin.from('jarvis_video_take_groups').insert(
      groups.map((g) => ({
        session_id: sessionId,
        source_ids: g.source_ids,
        segment_ids: [],
        similarity: g.similarity,
        confidence: g.confidence,
        similarity_basis: g.similarity_basis,
        note: g.note,
      }))
    )
  }

  return groups
}
