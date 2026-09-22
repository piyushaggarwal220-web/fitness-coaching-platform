/**
 * Durable video intelligence pipeline.
 * Stages are idempotent via step_key. Partial failures preserve earlier work.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { resolveSourceForProvider } from '@/lib/jarvis/video/sources'
import {
  getVideoIntelligenceProvider,
  classifyByHeuristic,
} from '@/lib/jarvis/video/intelligence/provider'
import {
  PIPELINE_STAGES,
  type PipelineStage,
  type PipelineStageStatus,
  type DetectedSegment,
  type TranscriptionResult,
} from '@/lib/jarvis/video/intelligence/types'
import { refreshSessionAggregates } from '@/lib/jarvis/video/intelligence/sessions'
import {
  buildOpportunitiesForSession,
  estimateReelCount,
} from '@/lib/jarvis/video/intelligence/opportunities'
import { detectTakeGroups } from '@/lib/jarvis/video/intelligence/takes'

function stepKey(sourceId: string, stage: PipelineStage, configHash: string) {
  return `${sourceId}:${stage}:${configHash}`
}

function configHash(): string {
  const p = getVideoIntelligenceProvider()
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider: p.name,
        kind: p.kind,
        caps: p.capabilities(),
        whisper: process.env.VIDEO_INTELLIGENCE_TRANSCRIPTION || 'off',
        llm: process.env.VIDEO_INTELLIGENCE_LLM_CLASSIFY || 'off',
      })
    )
    .digest('hex')
    .slice(0, 16)
}

async function upsertRun(input: {
  sessionId: string | null
  sourceId: string
  stage: PipelineStage
  status: PipelineStageStatus
  result?: Record<string, unknown>
  error?: string | null
  errorCode?: string | null
  costUsd?: number
  provider?: string
}) {
  const admin = createAdminClient()
  const ch = configHash()
  const key = stepKey(input.sourceId, input.stage, ch)
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    session_id: input.sessionId,
    source_id: input.sourceId,
    step_key: key,
    stage: input.stage,
    status: input.status,
    provider: input.provider ?? getVideoIntelligenceProvider().name,
    config_hash: ch,
    result: input.result ?? {},
    error: input.error ?? null,
    error_code: input.errorCode ?? null,
    cost_usd: input.costUsd ?? 0,
    updated_at: now,
  }
  if (input.status === 'RUNNING') patch.started_at = now
  if (
    input.status === 'COMPLETED' ||
    input.status === 'FAILED' ||
    input.status === 'UNSUPPORTED' ||
    input.status === 'PAUSED_BUDGET'
  ) {
    patch.completed_at = now
  }

  const { data: existing } = await admin
    .from('jarvis_video_analysis_runs')
    .select('id, status')
    .eq('step_key', key)
    .maybeSingle()

  if (existing?.id) {
    if (existing.status === 'COMPLETED' && input.status === 'RUNNING') {
      return { id: existing.id as string, skipped: true as const }
    }
    await admin.from('jarvis_video_analysis_runs').update(patch).eq('id', existing.id)
    return { id: existing.id as string, skipped: false as const }
  }

  const { data, error } = await admin
    .from('jarvis_video_analysis_runs')
    .insert(patch)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return { id: data!.id as string, skipped: false as const }
}

export async function getPipelineProgress(sourceId: string) {
  const admin = createAdminClient()
  const ch = configHash()
  const { data } = await admin
    .from('jarvis_video_analysis_runs')
    .select('stage, status, error, error_code, completed_at')
    .eq('source_id', sourceId)
    .eq('config_hash', ch)

  const byStage = new Map((data ?? []).map((r) => [r.stage as string, r]))
  const stages = PIPELINE_STAGES.map((stage) => {
    const row = byStage.get(stage)
    return {
      stage,
      status: (row?.status as PipelineStageStatus) || 'PENDING',
      error: row?.error ?? null,
      error_code: row?.error_code ?? null,
    }
  })
  const completed = stages.filter((s) =>
    ['COMPLETED', 'UNSUPPORTED'].includes(s.status)
  ).length
  return {
    completed_stages: completed,
    total_stages: PIPELINE_STAGES.length,
    stages,
    overall:
      completed === PIPELINE_STAGES.length
        ? 'COMPLETED'
        : stages.some((s) => s.status === 'FAILED')
          ? 'PARTIAL'
          : stages.some((s) => s.status === 'RUNNING' || s.status === 'QUEUED')
            ? 'RUNNING'
            : stages.some((s) => s.status === 'PAUSED_BUDGET')
              ? 'PAUSED_BUDGET'
              : 'PENDING',
  }
}

/**
 * Analyze one source through the pipeline. Resumes completed stages.
 */
export async function analyzeSource(input: {
  sourceId: string
  sessionId?: string | null
  actorId?: string | null
  forceStages?: PipelineStage[]
  maxCostUsd?: number
}): Promise<{
  ok: boolean
  source_id: string
  progress: Awaited<ReturnType<typeof getPipelineProgress>>
  summary: Record<string, unknown>
  error?: string
  paused_budget?: boolean
}> {
  const admin = createAdminClient()
  const provider = getVideoIntelligenceProvider()
  const maxCost = input.maxCostUsd ?? 0.5

  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    await admin
      .from('jarvis_video_sources')
      .update({ analysis_status: 'PAUSED_BUDGET', updated_at: new Date().toISOString() })
      .eq('id', input.sourceId)
    return {
      ok: false,
      source_id: input.sourceId,
      progress: await getPipelineProgress(input.sourceId),
      summary: {},
      error: gate.reason,
      paused_budget: true,
    }
  }

  const { data: source } = await admin
    .from('jarvis_video_sources')
    .select('*')
    .eq('id', input.sourceId)
    .maybeSingle()
  if (!source) {
    return {
      ok: false,
      source_id: input.sourceId,
      progress: await getPipelineProgress(input.sourceId),
      summary: {},
      error: 'SOURCE_NOT_FOUND',
    }
  }

  const sessionId = input.sessionId ?? source.session_id
  await admin
    .from('jarvis_video_sources')
    .update({
      analysis_status: 'RUNNING',
      processing_status: 'ANALYZING',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.sourceId)

  let spent = 0
  const force = new Set(input.forceStages ?? [])
  let transcript: TranscriptionResult | null = null
  let segments: DetectedSegment[] = []

  // Load existing transcript if completed
  const { data: existingTx } = await admin
    .from('jarvis_video_transcripts')
    .select('*')
    .eq('source_id', input.sourceId)
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingTx) {
    transcript = {
      status: 'COMPLETED',
      provider: existingTx.provider,
      full_text: existingTx.full_text,
      segments: (existingTx.segments as TranscriptionResult['segments']) || [],
      words: (existingTx.words as TranscriptionResult['words']) || [],
      language: existingTx.language,
      language_confidence: existingTx.language_confidence,
      confidence: existingTx.confidence as TranscriptionResult['confidence'],
      cost_usd: Number(existingTx.cost_usd || 0),
    }
  }

  // VALIDATE
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'VALIDATE',
      status: 'RUNNING',
    })
    if (!run.skipped || force.has('VALIDATE')) {
      const valid =
        source.processing_status !== 'INVALID' &&
        Number(source.byte_size) > 0 &&
        Boolean(source.mime_type)
      await upsertRun({
        sessionId,
        sourceId: input.sourceId,
        stage: 'VALIDATE',
        status: valid ? 'COMPLETED' : 'FAILED',
        result: { mime_type: source.mime_type, byte_size: source.byte_size },
        error: valid ? null : 'INVALID_FILE',
        errorCode: valid ? null : 'INVALID_FILE',
      })
      if (!valid) {
        await admin
          .from('jarvis_video_sources')
          .update({
            processing_status: 'INVALID',
            analysis_status: 'FAILED',
            error: 'INVALID_FILE',
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.sourceId)
        return {
          ok: false,
          source_id: input.sourceId,
          progress: await getPipelineProgress(input.sourceId),
          summary: {},
          error: 'INVALID_FILE',
        }
      }
    }
  }

  // METADATA
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'METADATA',
      status: 'RUNNING',
    })
    if (!run.skipped || force.has('METADATA')) {
      const resolved = await resolveSourceForProvider(source.source_ref)
      if (!resolved.ok || !resolved.private_fetch_url) {
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'METADATA',
          status: 'FAILED',
          error: resolved.error || 'STORAGE_ERROR',
          errorCode: 'STORAGE_ERROR',
        })
      } else {
        const meta = await provider.extractMetadata({
          sourceId: input.sourceId,
          privateFetchUrl: resolved.private_fetch_url,
        })
        if (meta.available) {
          await admin
            .from('jarvis_video_sources')
            .update({
              duration_sec: meta.duration_sec,
              width: meta.width,
              height: meta.height,
              fps: meta.fps,
              aspect_ratio: meta.aspect_ratio,
              orientation: meta.orientation,
              has_audio: meta.has_audio,
              audio_channels: meta.audio_channels,
              sample_rate: meta.sample_rate,
              video_codec: meta.video_codec,
              audio_codec: meta.audio_codec,
              processing_status: 'VALID',
              updated_at: new Date().toISOString(),
              metadata: {
                ...(typeof source.metadata === 'object' && source.metadata ? source.metadata : {}),
                probe_source: meta.source,
              },
            })
            .eq('id', input.sourceId)
          await upsertRun({
            sessionId,
            sourceId: input.sourceId,
            stage: 'METADATA',
            status: 'COMPLETED',
            result: meta as unknown as Record<string, unknown>,
          })
        } else {
          await upsertRun({
            sessionId,
            sourceId: input.sourceId,
            stage: 'METADATA',
            status: 'UNSUPPORTED',
            result: meta as unknown as Record<string, unknown>,
            error: 'Metadata extraction not available for current provider',
            errorCode: 'PROVIDER_UNSUPPORTED',
          })
        }
      }
    }
  }

  // AUDIO (identify only — no extraction required)
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'AUDIO',
      status: 'RUNNING',
    })
    if (!run.skipped || force.has('AUDIO')) {
      const { data: refreshed } = await admin
        .from('jarvis_video_sources')
        .select('has_audio')
        .eq('id', input.sourceId)
        .maybeSingle()
      const caps = provider.capabilities()
      if (caps.extract_audio === 'supported' && provider.extractAudio) {
        const resolved = await resolveSourceForProvider(source.source_ref)
        if (resolved.private_fetch_url) {
          const audio = await provider.extractAudio({
            sourceId: input.sourceId,
            privateFetchUrl: resolved.private_fetch_url,
          })
          await upsertRun({
            sessionId,
            sourceId: input.sourceId,
            stage: 'AUDIO',
            status: audio.status === 'supported' ? 'COMPLETED' : 'UNSUPPORTED',
            result: audio as unknown as Record<string, unknown>,
          })
        }
      } else {
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'AUDIO',
          status: refreshed?.has_audio == null ? 'UNSUPPORTED' : 'COMPLETED',
          result: {
            has_audio: refreshed?.has_audio ?? null,
            note: 'Audio presence from metadata only; extract_audio unsupported',
          },
        })
      }
    }
  }

  // TRANSCRIPTION
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'TRANSCRIPTION',
      status: 'RUNNING',
    })
    if ((!run.skipped && !transcript) || force.has('TRANSCRIPTION')) {
      if (spent + 0.05 > maxCost) {
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'TRANSCRIPTION',
          status: 'PAUSED_BUDGET',
          error: 'Budget bound for this analysis run',
          errorCode: 'BUDGET_EXHAUSTED',
        })
        await admin
          .from('jarvis_video_sources')
          .update({ analysis_status: 'PAUSED_BUDGET', transcription_status: 'QUEUED' })
          .eq('id', input.sourceId)
        return {
          ok: false,
          source_id: input.sourceId,
          progress: await getPipelineProgress(input.sourceId),
          summary: {},
          paused_budget: true,
          error: 'PAUSED_BUDGET',
        }
      }

      await admin
        .from('jarvis_video_sources')
        .update({ transcription_status: 'PROCESSING', updated_at: new Date().toISOString() })
        .eq('id', input.sourceId)

      const resolved = await resolveSourceForProvider(source.source_ref)
      const tx = await provider.transcribe({
        sourceId: input.sourceId,
        privateFetchUrl: resolved.private_fetch_url || '',
        mimeType: source.mime_type,
        filename: source.original_filename || undefined,
      })
      transcript = tx
      spent += tx.cost_usd

      if (tx.status === 'COMPLETED') {
        await admin.from('jarvis_video_transcripts').upsert(
          {
            source_id: input.sourceId,
            provider: tx.provider,
            language: tx.language,
            language_confidence: tx.language_confidence,
            full_text: tx.full_text,
            segments: tx.segments,
            words: tx.words,
            status: 'COMPLETED',
            confidence: tx.confidence,
            cost_usd: tx.cost_usd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'source_id,provider' }
        )
        if (tx.cost_usd > 0) {
          await recordCostUsage({
            category: 'video',
            toolName: 'video.intelligence.transcribe',
            costUsd: tx.cost_usd,
            metadata: { source_id: input.sourceId, provider: tx.provider },
          })
        }
        await admin
          .from('jarvis_video_sources')
          .update({ transcription_status: 'COMPLETED', updated_at: new Date().toISOString() })
          .eq('id', input.sourceId)
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'TRANSCRIPTION',
          status: 'COMPLETED',
          result: {
            language: tx.language,
            segment_count: tx.segments.length,
            word_count: tx.words.length,
            text_preview: tx.full_text.slice(0, 200),
          },
          costUsd: tx.cost_usd,
          provider: tx.provider,
        })
      } else if (tx.status === 'NOT_CONFIGURED' || tx.status === 'UNSUPPORTED') {
        await admin
          .from('jarvis_video_sources')
          .update({
            transcription_status: 'UNSUPPORTED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.sourceId)
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'TRANSCRIPTION',
          status: 'UNSUPPORTED',
          error: tx.error || 'Transcription is not currently configured.',
          errorCode: 'PROVIDER_UNSUPPORTED',
          provider: tx.provider,
        })
      } else {
        await admin
          .from('jarvis_video_sources')
          .update({
            transcription_status: 'FAILED',
            error: tx.error || 'TRANSCRIPTION_FAILED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.sourceId)
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'TRANSCRIPTION',
          status: 'FAILED',
          error: tx.error,
          errorCode: tx.error_code || 'TRANSCRIPTION_FAILED',
          provider: tx.provider,
        })
      }
    }
  }

  // SEGMENTS
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'SEGMENTS',
      status: 'RUNNING',
    })
    if (!run.skipped || force.has('SEGMENTS')) {
      if (provider.detectSpeechSegments && transcript?.status === 'COMPLETED') {
        const speech = await provider.detectSpeechSegments({
          sourceId: input.sourceId,
          transcript,
        })
        segments = speech.segments
        // Silence identification (do not delete)
        if (provider.detectSilence) {
          const resolved = await resolveSourceForProvider(source.source_ref)
          if (resolved.private_fetch_url) {
            const silence = await provider.detectSilence({
              sourceId: input.sourceId,
              privateFetchUrl: resolved.private_fetch_url,
            })
            if (silence.status === 'supported') {
              for (const s of silence.segments) {
                segments.push({
                  start_time: s.start,
                  end_time: s.end,
                  segment_type: 'SILENCE',
                  confidence: 'medium',
                  evidence: ['silence_detector'],
                })
              }
            }
          }
        }
        segments.sort((a, b) => a.start_time - b.start_time)
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'SEGMENTS',
          status: speech.status === 'supported' ? 'COMPLETED' : 'UNSUPPORTED',
          result: { count: segments.length, note: speech.note },
        })
      } else {
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'SEGMENTS',
          status: 'UNSUPPORTED',
          result: { count: 0 },
          error: 'Speech segments require completed transcript',
          errorCode: 'PROVIDER_UNSUPPORTED',
        })
      }
    } else {
      // Load persisted segments
      const { data: rows } = await admin
        .from('jarvis_video_segments')
        .select('*')
        .eq('source_id', input.sourceId)
        .eq('status', 'ACTIVE')
        .order('start_time', { ascending: true })
      segments = (rows ?? []).map((r) => ({
        start_time: Number(r.start_time),
        end_time: Number(r.end_time),
        segment_type: r.segment_type,
        classification_label: r.classification_label,
        transcript_excerpt: r.transcript_excerpt,
        confidence: (r.confidence || 'low') as DetectedSegment['confidence'],
        evidence: (r.evidence as string[]) || [],
      }))
    }
  }

  // CLASSIFICATION
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'CLASSIFICATION',
      status: 'RUNNING',
    })
    if (!run.skipped || force.has('CLASSIFICATION')) {
      if (!segments.length) {
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'CLASSIFICATION',
          status: 'UNSUPPORTED',
          error: 'No segments to classify',
          errorCode: 'PROVIDER_UNSUPPORTED',
        })
      } else {
        let classified = segments
        let cost = 0
        let note = 'heuristic'
        if (provider.classifySegments) {
          const result = await provider.classifySegments({
            sourceId: input.sourceId,
            segments,
            transcript: transcript ?? undefined,
          })
          classified = result.segments
          cost = result.cost_usd
          note = result.note
          spent += cost
        } else {
          classified = classifyByHeuristic(segments)
        }

        // Replace active segments for this source
        await admin
          .from('jarvis_video_segments')
          .update({ status: 'SUPERSEDED', updated_at: new Date().toISOString() })
          .eq('source_id', input.sourceId)
          .eq('status', 'ACTIVE')

        const { data: txRow } = await admin
          .from('jarvis_video_transcripts')
          .select('id')
          .eq('source_id', input.sourceId)
          .eq('status', 'COMPLETED')
          .limit(1)
          .maybeSingle()

        if (classified.length) {
          await admin.from('jarvis_video_segments').insert(
            classified.map((s) => ({
              source_id: input.sourceId,
              start_time: s.start_time,
              end_time: s.end_time,
              duration: Math.max(0, s.end_time - s.start_time),
              segment_type: s.segment_type,
              classification_label: s.classification_label ?? null,
              transcript_excerpt: s.transcript_excerpt ?? null,
              transcript_id: txRow?.id ?? null,
              confidence: s.confidence,
              evidence: s.evidence,
              status: 'ACTIVE',
              metadata: s.metadata ?? {},
            }))
          )
        }

        if (cost > 0) {
          await recordCostUsage({
            category: 'video',
            toolName: 'video.intelligence.classify',
            costUsd: cost,
            metadata: { source_id: input.sourceId },
          })
        }

        segments = classified
        await upsertRun({
          sessionId,
          sourceId: input.sourceId,
          stage: 'CLASSIFICATION',
          status: 'COMPLETED',
          result: {
            count: classified.length,
            labels: classified.map((c) => c.classification_label),
            note,
          },
          costUsd: cost,
        })
      }
    }
  }

  // QUALITY
  {
    const run = await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'QUALITY',
      status: 'RUNNING',
    })
    if (!run.skipped || force.has('QUALITY')) {
      const { data: src } = await admin
        .from('jarvis_video_sources')
        .select('duration_sec, width, height, fps, has_audio, orientation')
        .eq('id', input.sourceId)
        .maybeSingle()
      const metadata = {
        duration_sec: src?.duration_sec != null ? Number(src.duration_sec) : null,
        width: src?.width ?? null,
        height: src?.height ?? null,
        fps: src?.fps != null ? Number(src.fps) : null,
        aspect_ratio: null,
        orientation: (src?.orientation as 'portrait' | 'landscape' | 'square' | null) ?? null,
        has_audio: src?.has_audio ?? null,
        audio_channels: null,
        sample_rate: null,
        video_codec: null,
        audio_codec: null,
        source: 'unavailable' as const,
        available: Boolean(src?.width),
      }
      const quality = provider.analyzeQuality
        ? await provider.analyzeQuality({
            sourceId: input.sourceId,
            metadata,
            transcript,
          })
        : {
            deterministic: {
              resolution:
                src?.width && src?.height ? `${src.width}×${src.height}` : null,
              fps: metadata.fps,
              has_audio: metadata.has_audio,
              duration_sec: metadata.duration_sec,
              orientation: metadata.orientation,
            },
            judgment: {},
            judgment_available: false,
            judgment_source: 'none' as const,
          }
      await upsertRun({
        sessionId,
        sourceId: input.sourceId,
        stage: 'QUALITY',
        status: 'COMPLETED',
        result: quality as unknown as Record<string, unknown>,
      })
    }
  }

  // INDEX (noop durable marker — search reads tables)
  {
    await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'INDEX',
      status: 'COMPLETED',
      result: {
        searchable: Boolean(transcript?.full_text || segments.length),
        note: 'Structured index via jarvis_video_transcripts + jarvis_video_segments',
      },
    })
  }

  // OPPORTUNITIES at source level — real aggregation happens at session
  {
    await upsertRun({
      sessionId,
      sourceId: input.sourceId,
      stage: 'OPPORTUNITIES',
      status: 'COMPLETED',
      result: {
        note: sessionId
          ? 'Source ready for session opportunity aggregation'
          : 'No session — skip session-level opportunities',
      },
    })
  }

  await admin
    .from('jarvis_video_sources')
    .update({
      analysis_status: 'COMPLETED',
      processing_status: 'ANALYZED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.sourceId)

  if (sessionId) {
    await refreshSessionAggregates(sessionId)
  }

  const progress = await getPipelineProgress(input.sourceId)
  return {
    ok: true,
    source_id: input.sourceId,
    progress,
    summary: {
      provider: provider.name,
      kind: provider.kind,
      transcript_status: transcript?.status ?? 'NONE',
      segment_count: segments.length,
      spent_usd: spent,
      capabilities: provider.capabilities(),
    },
  }
}

/**
 * Analyze all sources in a session + build opportunities / take groups.
 */
export async function analyzeSession(input: {
  sessionId: string
  actorId?: string | null
  maxSources?: number
  maxCostUsd?: number
}) {
  const admin = createAdminClient()
  const gate = await assertAiBudgetAvailable(0.1)
  if (!gate.ok) {
    await admin
      .from('jarvis_video_sessions')
      .update({ status: 'paused_budget', updated_at: new Date().toISOString() })
      .eq('id', input.sessionId)
    return { ok: false, error: gate.reason, paused_budget: true }
  }

  await admin
    .from('jarvis_video_sessions')
    .update({ status: 'analyzing', updated_at: new Date().toISOString() })
    .eq('id', input.sessionId)

  // Queue background job record (reuse existing infrastructure)
  await admin.from('jarvis_background_jobs').insert({
    job_type: 'video_intelligence',
    status: 'running',
    started_at: new Date().toISOString(),
    payload: { session_id: input.sessionId },
  })

  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('id')
    .eq('session_id', input.sessionId)
    .order('created_at', { ascending: true })
    .limit(input.maxSources ?? 20)

  const results = []
  for (const s of sources ?? []) {
    const r = await analyzeSource({
      sourceId: s.id,
      sessionId: input.sessionId,
      actorId: input.actorId,
      maxCostUsd: input.maxCostUsd ?? 0.4,
    })
    results.push(r)
    if (r.paused_budget) break
  }

  const takes = await detectTakeGroups(input.sessionId)
  const opportunities = await buildOpportunitiesForSession(input.sessionId)
  const estimate = await estimateReelCount(input.sessionId)

  await admin
    .from('jarvis_video_sessions')
    .update({
      status: results.some((r) => r.paused_budget)
        ? 'paused_budget'
        : results.every((r) => r.ok)
          ? 'analyzed'
          : 'partial',
      opportunity_count: opportunities.length,
      analysis_summary: {
        sources_analyzed: results.filter((r) => r.ok).length,
        sources_failed: results.filter((r) => !r.ok).length,
        take_groups: takes.length,
        opportunities: opportunities.length,
        estimate,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId)

  await admin
    .from('jarvis_background_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: {
        session_id: input.sessionId,
        results: results.map((r) => ({
          source_id: r.source_id,
          ok: r.ok,
          error: r.error,
        })),
        opportunities: opportunities.length,
        estimate,
      },
    })
    .eq('job_type', 'video_intelligence')
    .eq('status', 'running')
    .contains('payload', { session_id: input.sessionId })

  return {
    ok: true,
    session_id: input.sessionId,
    sources: results,
    take_groups: takes.length,
    opportunities,
    estimate,
  }
}

/** Process due video intelligence jobs from background cycle. */
export async function processDueVideoIntelligence(opts?: { maxSessions?: number }) {
  const admin = createAdminClient()
  const gate = await assertAiBudgetAvailable(0.1)
  if (!gate.ok) return { processed: 0, errors: [gate.reason], paused_budget: true }

  const { data: sessions } = await admin
    .from('jarvis_video_sessions')
    .select('id')
    .eq('status', 'analyzing')
    .order('updated_at', { ascending: true })
    .limit(opts?.maxSessions ?? 2)

  const errors: string[] = []
  let processed = 0
  for (const s of sessions ?? []) {
    try {
      await analyzeSession({ sessionId: s.id, maxSources: 5, maxCostUsd: 0.5 })
      processed += 1
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'session analyze failed')
    }
  }
  return { processed, errors }
}
