/**
 * Structured footage search — transcripts, classifications, filenames.
 * No embeddings in Phase 4.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type FootageSearchHit = {
  source_id: string
  source_ref: string
  filename: string | null
  start: number | null
  end: number | null
  transcript: string | null
  classification: string | null
  segment_type: string | null
  confidence: string | null
  relevance: 'HIGH' | 'MEDIUM' | 'LOW'
  session_id: string | null
}

export async function searchFootage(input: {
  query?: string
  sessionId?: string
  sourceId?: string
  classification?: string
  minQuality?: string
  hasTranscript?: boolean
  hasAudio?: boolean
  limit?: number
}): Promise<FootageSearchHit[]> {
  const admin = createAdminClient()
  const limit = Math.min(input.limit ?? 20, 50)
  const q = (input.query || '').trim().toLowerCase()

  let sourceQuery = admin
    .from('jarvis_video_sources')
    .select(
      'id, source_ref, original_filename, session_id, has_audio, analysis_status, transcription_status'
    )
    .order('created_at', { ascending: false })
    .limit(80)

  if (input.sessionId) sourceQuery = sourceQuery.eq('session_id', input.sessionId)
  if (input.sourceId) sourceQuery = sourceQuery.eq('id', input.sourceId)
  if (input.hasAudio === true) sourceQuery = sourceQuery.eq('has_audio', true)

  const { data: sources } = await sourceQuery
  let sourceRows = sources ?? []
  if (input.hasTranscript) {
    sourceRows = sourceRows.filter((s) => s.transcription_status === 'COMPLETED')
  }

  if (!sourceRows.length) return []

  const sourceIds = sourceRows.map((s) => s.id)
  const byId = new Map(sourceRows.map((s) => [s.id, s]))

  const hits: FootageSearchHit[] = []

  // Segment / classification search
  let segQ = admin
    .from('jarvis_video_segments')
    .select(
      'source_id, start_time, end_time, transcript_excerpt, classification_label, segment_type, confidence'
    )
    .in('source_id', sourceIds)
    .eq('status', 'ACTIVE')
    .limit(200)

  if (input.classification) {
    segQ = segQ.eq('classification_label', input.classification.toUpperCase())
  }

  const { data: segments } = await segQ

  for (const seg of segments ?? []) {
    const src = byId.get(seg.source_id)
    if (!src) continue
    const text = `${seg.transcript_excerpt || ''} ${seg.classification_label || ''} ${seg.segment_type || ''} ${src.original_filename || ''}`.toLowerCase()
    if (q && !text.includes(q) && !q.split(/\s+/).some((t) => t.length > 2 && text.includes(t))) {
      continue
    }
    const relevance: FootageSearchHit['relevance'] =
      q && (seg.transcript_excerpt || '').toLowerCase().includes(q)
        ? 'HIGH'
        : q
          ? 'MEDIUM'
          : 'MEDIUM'
    hits.push({
      source_id: src.id,
      source_ref: src.source_ref,
      filename: src.original_filename,
      start: Number(seg.start_time),
      end: Number(seg.end_time),
      transcript: seg.transcript_excerpt,
      classification: seg.classification_label,
      segment_type: seg.segment_type,
      confidence: seg.confidence,
      relevance,
      session_id: src.session_id,
    })
  }

  // Transcript full-text scan for misses
  if (q) {
    const { data: txs } = await admin
      .from('jarvis_video_transcripts')
      .select('source_id, full_text, segments')
      .in('source_id', sourceIds)
      .eq('status', 'COMPLETED')

    for (const tx of txs ?? []) {
      const full = (tx.full_text || '').toLowerCase()
      if (!full.includes(q) && !q.split(/\s+/).some((t) => t.length > 3 && full.includes(t))) {
        continue
      }
      const src = byId.get(tx.source_id)
      if (!src) continue
      // Prefer matching transcript segment timestamps
      const segs = (tx.segments as { start: number; end: number; text: string }[]) || []
      const match = segs.find((s) => s.text.toLowerCase().includes(q)) || segs[0]
      const already = hits.some(
        (h) =>
          h.source_id === src.id &&
          match &&
          h.start === match.start &&
          h.end === match.end
      )
      if (already) continue
      hits.push({
        source_id: src.id,
        source_ref: src.source_ref,
        filename: src.original_filename,
        start: match?.start ?? null,
        end: match?.end ?? null,
        transcript: match?.text ?? tx.full_text.slice(0, 240),
        classification: null,
        segment_type: 'SPEECH',
        confidence: null,
        relevance: match ? 'HIGH' : 'MEDIUM',
        session_id: src.session_id,
      })
    }
  }

  // Filename-only fallback
  if (q) {
    for (const src of sourceRows) {
      if (!(src.original_filename || '').toLowerCase().includes(q)) continue
      if (hits.some((h) => h.source_id === src.id)) continue
      hits.push({
        source_id: src.id,
        source_ref: src.source_ref,
        filename: src.original_filename,
        start: null,
        end: null,
        transcript: null,
        classification: null,
        segment_type: null,
        confidence: null,
        relevance: 'LOW',
        session_id: src.session_id,
      })
    }
  }

  hits.sort((a, b) => {
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 }
    return rank[b.relevance] - rank[a.relevance]
  })

  return hits.slice(0, limit)
}

export async function sessionSummary(sessionId: string) {
  const admin = createAdminClient()
  const session = await admin
    .from('jarvis_video_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session.data) return null

  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select(
      'id, duration_sec, analysis_status, transcription_status, processing_status, error'
    )
    .eq('session_id', sessionId)

  const sourceIds = (sources ?? []).map((s) => s.id)
  const [{ count: segmentCount }, { count: oppCount }, { data: takes }, estimate] =
    await Promise.all([
      sourceIds.length
        ? admin
            .from('jarvis_video_segments')
            .select('id', { count: 'exact', head: true })
            .in('source_id', sourceIds)
            .eq('status', 'ACTIVE')
        : Promise.resolve({ count: 0 }),
      admin
        .from('jarvis_video_opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('status', 'candidate'),
      admin.from('jarvis_video_take_groups').select('id, note, similarity_basis').eq('session_id', sessionId),
      import('@/lib/jarvis/video/intelligence/opportunities').then((m) =>
        m.estimateReelCount(sessionId)
      ),
    ])

  const transcribed = (sources ?? []).filter((s) => s.transcription_status === 'COMPLETED').length
  const errors = (sources ?? [])
    .filter((s) => s.error)
    .map((s) => ({ source_id: s.id, error: s.error }))

  return {
    session: session.data,
    source_count: sources?.length ?? 0,
    total_duration_sec: session.data.total_duration_sec,
    processed_count: (sources ?? []).filter((s) => s.analysis_status === 'COMPLETED').length,
    transcription_coverage: {
      completed: transcribed,
      total: sources?.length ?? 0,
    },
    segment_count: segmentCount ?? 0,
    duplicate_take_groups: takes?.length ?? 0,
    take_groups: takes ?? [],
    opportunity_count: oppCount ?? 0,
    estimate,
    processing_errors: errors,
  }
}
