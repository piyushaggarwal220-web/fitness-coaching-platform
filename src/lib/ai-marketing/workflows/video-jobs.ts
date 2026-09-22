import { createAdminClient } from '@/lib/supabase/admin'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import {
  getVideoEditProvider,
  type VideoEditPlan,
  type VideoJobStatus,
  type VideoRenderResult,
} from '@/lib/jarvis/video/provider'
import {
  buildShortFormFitnessReelPlan,
  SHORT_FORM_FITNESS_REEL_PRESET,
  MAX_VARIANTS_PER_JOB,
  type VideoVariantKind,
} from '@/lib/jarvis/video/presets'
import {
  resolveSourceForProvider,
  validateSourceReferenceOrUrl,
} from '@/lib/jarvis/video/sources'

export {
  getVideoEditProvider,
  isVideoProviderConfigured,
  describeVideoProviderConfig,
  StubVideoEditProvider,
  HttpVideoEditProvider,
  TestVideoEditProvider,
} from '@/lib/jarvis/video/provider'
export { ShotstackVideoEditProvider } from '@/lib/jarvis/video/shotstack/provider'
export type { VideoEditProvider, VideoRenderResult, VideoEditPlan } from '@/lib/jarvis/video/provider'

const DEFAULT_JOB_COST_USD = 0.35
const MAX_RETRIES = 2
const MAX_JOB_BUDGET_USD = 2

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/i.test(value)) return value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    if (value.length > 200 && /https?:\/\//.test(value)) return '[redacted-url]'
    return value
  }
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|token|api[_-]?key|authorization|password/i.test(k)) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = redactSecrets(v)
      }
    }
    return out
  }
  return value
}

async function resolveSourceVideo(sourceVideo: string): Promise<{
  ok: boolean
  source_video: string
  source_ref: string | null
  error?: string
}> {
  const validated = validateSourceReferenceOrUrl(sourceVideo)
  if (!validated.ok) {
    return { ok: false, source_video: sourceVideo, source_ref: null, error: validated.error }
  }
  if (validated.kind === 'source_ref') {
    const resolved = await resolveSourceForProvider(validated.value)
    if (!resolved.ok || !resolved.private_fetch_url) {
      return {
        ok: false,
        source_video: sourceVideo,
        source_ref: validated.value,
        error: resolved.error || 'Failed to resolve source',
      }
    }
    return {
      ok: true,
      source_video: resolved.private_fetch_url,
      source_ref: validated.value,
    }
  }
  // job_id — reuse prior job source_ref / source_video
  const admin = createAdminClient()
  const { data } = await admin
    .from('video_edit_jobs')
    .select('source_video, source_ref')
    .eq('id', validated.value)
    .maybeSingle()
  if (!data) {
    return { ok: false, source_video: sourceVideo, source_ref: null, error: 'Job not found' }
  }
  if (data.source_ref) {
    const resolved = await resolveSourceForProvider(data.source_ref)
    if (resolved.ok && resolved.private_fetch_url) {
      return {
        ok: true,
        source_video: resolved.private_fetch_url,
        source_ref: data.source_ref,
      }
    }
  }
  // Legacy rows may still have opaque refs only — do not re-fetch arbitrary URLs
  if (String(data.source_video).startsWith('jarvis-video://')) {
    const resolved = await resolveSourceForProvider(String(data.source_video))
    if (resolved.ok && resolved.private_fetch_url) {
      return {
        ok: true,
        source_video: resolved.private_fetch_url,
        source_ref: String(data.source_video),
      }
    }
  }
  return {
    ok: false,
    source_video: sourceVideo,
    source_ref: data.source_ref ?? null,
    error: 'Cannot reuse legacy filesystem/URL sources. Re-upload via jarvis-video:// source_ref.',
  }
}

export async function createVideoEditJob(input: {
  sourceVideo: string
  instructions?: Record<string, unknown>
  actorId?: string | null
  funnelId?: string | null
  requireApprovalBeforePublish?: boolean
  preset?: string
  aspectRatio?: string
  durationTargetSec?: number
  variants?: VideoVariantKind[]
  estimatedCostUsd?: number
}) {
  const estimated = Math.min(input.estimatedCostUsd ?? DEFAULT_JOB_COST_USD, MAX_JOB_BUDGET_USD)
  const gate = await assertAiBudgetAvailable(estimated)
  if (!gate.ok) {
    const admin = createAdminClient()
    const { data: job } = await admin
      .from('video_edit_jobs')
      .insert({
        source_video: input.sourceVideo.startsWith('jarvis-video://')
          ? input.sourceVideo
          : 'unresolved',
        source_ref: input.sourceVideo.startsWith('jarvis-video://') ? input.sourceVideo : null,
        status: 'paused_budget',
        edit_instructions: input.instructions ?? {},
        provider: getVideoEditProvider().name,
        error: `paused_budget: ${gate.reason}`,
        approval_status: 'none',
        funnel_id: input.funnelId ?? null,
        created_by: input.actorId ?? null,
        estimated_cost_usd: estimated,
        preset: input.preset ?? SHORT_FORM_FITNESS_REEL_PRESET,
        completed_at: new Date().toISOString(),
        metadata: { available: false, paused_budget: true, error_code: 'paused_budget' },
      })
      .select('*')
      .maybeSingle()

    return {
      id: job?.id,
      status: 'paused_budget' as VideoJobStatus,
      provider: getVideoEditProvider().name,
      available: false,
      error: gate.reason,
      error_code: 'paused_budget',
    }
  }

  const admin = createAdminClient()
  const provider = getVideoEditProvider()
  const variants = (input.variants ?? []).slice(0, MAX_VARIANTS_PER_JOB)

  const resolved = await resolveSourceVideo(input.sourceVideo)
  if (!resolved.ok) {
    const { data: job } = await admin
      .from('video_edit_jobs')
      .insert({
        source_video: resolved.source_ref || 'rejected',
        source_ref: resolved.source_ref,
        status: 'failed',
        edit_instructions: input.instructions ?? {},
        provider: provider.name,
        error: resolved.error,
        approval_status: 'none',
        funnel_id: input.funnelId ?? null,
        created_by: input.actorId ?? null,
        estimated_cost_usd: estimated,
        completed_at: new Date().toISOString(),
        metadata: { available: false },
      })
      .select('*')
      .maybeSingle()
    return {
      id: job?.id,
      status: 'failed' as VideoJobStatus,
      provider: provider.name,
      available: false,
      error: resolved.error,
    }
  }

  if (!provider.configured || provider.kind === 'STUB') {
    const { data: job, error } = await admin
      .from('video_edit_jobs')
      .insert({
        source_video: resolved.source_ref || 'stub',
        source_ref: resolved.source_ref,
        status: 'failed',
        edit_instructions: {
          ...(input.instructions ?? {}),
          requested: true,
          variants,
        },
        provider: 'stub',
        error: 'Video editing provider is not configured.',
        approval_status: 'none',
        funnel_id: input.funnelId ?? null,
        created_by: input.actorId ?? null,
        completed_at: new Date().toISOString(),
        estimated_cost_usd: estimated,
        preset: input.preset ?? SHORT_FORM_FITNESS_REEL_PRESET,
        aspect_ratio: input.aspectRatio ?? '9:16',
        duration_target_sec: input.durationTargetSec ?? null,
        metadata: { available: false, provider_kind: 'STUB' },
      })
      .select('*')
      .maybeSingle()

    if (error) throw new Error(error.message)

    await writeMarketingAudit({
      agent: 'video',
      decision: 'video_provider_missing',
      action: 'video_edit',
      actor_id: input.actorId ?? null,
      error: 'Video editing provider is not configured.',
      execution_result: redactSecrets({ job_id: job?.id }) as Record<string, unknown>,
    })

    return {
      id: job?.id,
      status: 'failed' as VideoJobStatus,
      provider: 'stub',
      available: false,
      provider_kind: 'STUB' as const,
      error: 'Video editing provider is not configured.',
    }
  }

  const instructions = {
    ...(input.instructions ?? {}),
    preset: input.preset ?? SHORT_FORM_FITNESS_REEL_PRESET,
    variants,
    duration_target_sec: input.durationTargetSec ?? null,
  }

  const { data: job, error } = await admin
    .from('video_edit_jobs')
    .insert({
      source_video: resolved.source_ref || 'provider',
      source_ref: resolved.source_ref,
      status: 'queued',
      edit_instructions: instructions,
      provider: provider.name,
      approval_status: input.requireApprovalBeforePublish === false ? 'none' : 'pending',
      funnel_id: input.funnelId ?? null,
      created_by: input.actorId ?? null,
      estimated_cost_usd: estimated,
      preset: input.preset ?? SHORT_FORM_FITNESS_REEL_PRESET,
      aspect_ratio: input.aspectRatio ?? '9:16',
      duration_target_sec: input.durationTargetSec ?? null,
      metadata: { provider_kind: provider.kind, retry_count: 0 },
    })
    .select('*')
    .maybeSingle()

  if (error || !job) throw new Error(error?.message || 'Failed to create video job')

  try {
    await admin.from('video_edit_jobs').update({ status: 'analyzing' }).eq('id', job.id)

    const result = await provider.process({
      id: job.id,
      source_video: resolved.source_video,
      edit_instructions: instructions,
    })

    // Prefer provider estimate (Shotstack duration-based) when present
    const costEstimate = Math.min(
      result.estimated_cost_usd ?? estimated,
      MAX_JOB_BUDGET_USD
    )
    if ((result.estimated_cost_usd ?? 0) > estimated) {
      const reGate = await assertAiBudgetAvailable(costEstimate - estimated)
      if (!reGate.ok) {
        await admin
          .from('video_edit_jobs')
          .update({
            status: 'paused_budget',
            error: `paused_budget: ${reGate.reason}`,
            estimated_cost_usd: costEstimate,
            analysis: result.analysis ?? {},
            edit_plan: result.edit_plan ?? {},
            completed_at: new Date().toISOString(),
            metadata: {
              provider_kind: provider.kind,
              error_code: 'paused_budget',
              provider_metadata: result.provider_metadata ?? {},
            },
          })
          .eq('id', job.id)
        return {
          id: job.id,
          status: 'paused_budget' as VideoJobStatus,
          provider: provider.name,
          provider_kind: provider.kind,
          available: false,
          error: reGate.reason,
          error_code: 'paused_budget',
          published: false,
        }
      }
    }

    await recordCostUsage({
      category: 'tool',
      toolName: 'video.create_edit_job',
      costUsd: costEstimate,
      metadata: {
        job_id: job.id,
        provider: provider.name,
        kind: provider.kind,
        provider_job_id: result.provider_job_id ?? null,
      },
    })

    // Never mark completed without a real output confirmed by provider
    let status: VideoJobStatus = result.status
    if (status === 'completed' && !result.output_video) {
      status = 'failed'
      result.error = result.error || 'Provider returned completed without output_video'
    }
    // Async Shotstack: rendering/queued stay open (webhook/poll completes later)
    const asyncOpen = status === 'rendering' || status === 'queued' || status === 'processing'
    if (status === 'completed' && input.requireApprovalBeforePublish !== false) {
      status = 'awaiting_approval'
    }

    await admin
      .from('video_edit_jobs')
      .update({
        status,
        transcript: result.transcript ?? null,
        output_video: result.output_video ?? null,
        output_variants: result.output_variants ?? [],
        analysis: result.analysis ?? {},
        edit_plan: result.edit_plan ?? {},
        provider_job_id: result.provider_job_id ?? null,
        crop_strategy: result.crop_strategy ?? null,
        estimated_cost_usd: costEstimate,
        actual_cost_usd: status === 'awaiting_approval' || status === 'completed' ? costEstimate : null,
        edit_instructions: {
          ...instructions,
          ...(result.edit_plan ? { plan: result.edit_plan } : {}),
          subtitles: result.subtitles ?? null,
          provider_metadata: result.provider_metadata ?? null,
        },
        error: result.error ?? null,
        approval_status:
          status === 'awaiting_approval' ? 'pending' : job.approval_status ?? 'none',
        completed_at:
          asyncOpen
            ? null
            : status === 'completed' ||
                status === 'failed' ||
                status === 'awaiting_approval' ||
                status === 'review_required' ||
                status === 'cancelled' ||
                status === 'paused_budget'
              ? new Date().toISOString()
              : null,
        metadata: {
          provider_kind: provider.kind,
          retry_count: 0,
          burned_in_subtitles: result.subtitles?.burned_in ?? false,
          provider_metadata: result.provider_metadata ?? {},
          published: false,
        },
      })
      .eq('id', job.id)

    if (status === 'awaiting_approval') {
      await admin.from('jarvis_notifications').insert({
        kind: 'approval',
        title: 'Video ready for approval',
        body: `Edit job ${job.id} finished rendering and awaits publish approval. Not published.`,
        link: '/admin/jarvis',
        metadata: { video_job_id: job.id },
      })
    }

    await writeMarketingAudit({
      agent: 'video',
      decision: asyncOpen ? 'video_job_queued' : 'video_job_processed',
      action: 'video_edit',
      actor_id: input.actorId ?? null,
      execution_result: redactSecrets({
        job_id: job.id,
        status,
        provider: provider.name,
        provider_kind: provider.kind,
        provider_job_id: result.provider_job_id ?? null,
        has_output: Boolean(result.output_video),
        published: false,
      }) as Record<string, unknown>,
    })

    return {
      id: job.id,
      status,
      provider: provider.name,
      provider_kind: provider.kind,
      available: true,
      provider_job_id: result.provider_job_id ?? null,
      output_video: result.output_video ?? null,
      error: result.error ?? null,
      estimated_cost_usd: costEstimate,
      published: false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Video processing failed'
    await admin
      .from('video_edit_jobs')
      .update({
        status: 'failed',
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    return {
      id: job.id,
      status: 'failed' as VideoJobStatus,
      provider: provider.name,
      provider_kind: provider.kind,
      available: true,
      error: message,
      published: false,
    }
  }
}

export async function analyzeVideoOnly(input: {
  sourceVideo: string
  actorId?: string | null
}) {
  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    return {
      ok: false,
      status: 'paused_budget' as const,
      analysis: null,
      error: gate.reason,
    }
  }
  const provider = getVideoEditProvider()
  if (!provider.configured || provider.kind === 'STUB') {
    return {
      ok: false,
      status: 'failed' as const,
      analysis: await provider.analyzeVideo({ jobId: 'analyze-only', sourceVideo: input.sourceVideo }),
      error: 'Video editing provider is not configured.',
      provider_kind: provider.kind,
    }
  }
  const resolved = await resolveSourceVideo(input.sourceVideo)
  if (!resolved.ok) {
    return { ok: false, status: 'failed' as const, analysis: null, error: resolved.error }
  }
  const analysis = await provider.analyzeVideo({
    jobId: `analyze-${Date.now()}`,
    sourceVideo: resolved.source_video,
  })
  await recordCostUsage({
    category: 'tool',
    toolName: 'video.analyze',
    costUsd: 0.05,
    metadata: { provider: provider.name },
  })
  return {
    ok: analysis.available,
    status: 'completed' as const,
    analysis,
    provider: provider.name,
    provider_kind: provider.kind,
    published: false,
  }
}

export async function cancelVideoJob(input: {
  jobId: string
  actorId?: string | null
}) {
  const admin = createAdminClient()
  const { data: job } = await admin
    .from('video_edit_jobs')
    .select('*')
    .eq('id', input.jobId)
    .maybeSingle()
  if (!job) return { ok: false, error: 'Job not found' }

  const terminal = ['completed', 'failed', 'cancelled', 'awaiting_approval']
  if (terminal.includes(job.status) && job.status !== 'awaiting_approval') {
    return { ok: false, error: `Job already ${job.status}` }
  }

  const provider = getVideoEditProvider()
  if (job.provider_job_id && provider.cancel) {
    await provider.cancel(job.provider_job_id)
  }

  await admin
    .from('video_edit_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error: job.error ?? 'Cancelled by operator',
    })
    .eq('id', input.jobId)

  await writeMarketingAudit({
    agent: 'video',
    decision: 'video_job_cancelled',
    action: 'video_cancel',
    actor_id: input.actorId ?? null,
    execution_result: { job_id: input.jobId },
  })

  return { ok: true, status: 'cancelled' as const, job_id: input.jobId }
}

/**
 * Idempotent webhook completion — never double-complete.
 * For Shotstack: caller must verify render status via API before trusting payload.
 */
export async function completeVideoJobFromWebhook(input: {
  jobId?: string | null
  providerJobId?: string | null
  status: VideoJobStatus
  outputVideo?: string | null
  outputVariants?: unknown
  transcript?: string | null
  analysis?: unknown
  editPlan?: unknown
  error?: string | null
  cropStrategy?: string | null
  archivePrivate?: boolean
  verifiedByProvider?: boolean
}): Promise<{ ok: boolean; duplicate: boolean; status: string; error?: string; archived?: boolean }> {
  const admin = createAdminClient()

  let job: Record<string, unknown> | null = null
  if (input.jobId) {
    const { data } = await admin.from('video_edit_jobs').select('*').eq('id', input.jobId).maybeSingle()
    job = data
  }
  if (!job && input.providerJobId) {
    const { data } = await admin
      .from('video_edit_jobs')
      .select('*')
      .eq('provider_job_id', input.providerJobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    job = data
  }

  if (!job) return { ok: false, duplicate: false, status: 'missing', error: 'Job not found' }

  const jobId = String(job.id)
  if (
    job.status === 'completed' ||
    job.status === 'awaiting_approval' ||
    (job.status === 'failed' && job.output_video)
  ) {
    return { ok: true, duplicate: true, status: String(job.status) }
  }

  // Require verification for completion claims
  if (
    (input.status === 'completed' || input.status === 'awaiting_approval') &&
    !input.verifiedByProvider
  ) {
    return {
      ok: false,
      duplicate: false,
      status: String(job.status),
      error: 'Completion rejected: provider verification required.',
    }
  }

  let status = input.status
  let outputVideo = input.outputVideo ?? null
  let archived = false

  if (status === 'completed' && !outputVideo) {
    status = 'failed'
  }

  if (status === 'completed' && outputVideo && input.archivePrivate !== false) {
    const { archiveShotstackResult } = await import('@/lib/jarvis/video/shotstack/archive')
    const archivedResult = await archiveShotstackResult({
      jobId,
      providerUrl: outputVideo,
      renderId: String(input.providerJobId || job.provider_job_id || 'unknown'),
    })
    if (archivedResult.ok && archivedResult.output_ref) {
      outputVideo = archivedResult.output_ref
      archived = true
    } else if (archivedResult.expired) {
      // Keep provider URL but mark metadata — do not pretend permanent storage
      outputVideo = archivedResult.provider_url_kept || outputVideo
    }
  }

  if (status === 'completed') {
    status = 'awaiting_approval'
  }

  const prevMeta = (job.metadata as Record<string, unknown>) || {}
  await admin
    .from('video_edit_jobs')
    .update({
      status,
      provider_job_id: input.providerJobId ?? job.provider_job_id,
      output_video: outputVideo,
      output_variants: input.outputVariants ?? job.output_variants ?? [],
      transcript: input.transcript ?? job.transcript,
      analysis: input.analysis ?? job.analysis,
      edit_plan: input.editPlan ?? job.edit_plan,
      crop_strategy: input.cropStrategy ?? job.crop_strategy,
      error:
        input.error ??
        (status === 'failed' && !outputVideo
          ? 'Provider claimed completed without output_video'
          : job.error),
      completed_at:
        status === 'rendering' || status === 'queued' || status === 'processing'
          ? null
          : new Date().toISOString(),
      approval_status: status === 'awaiting_approval' ? 'pending' : job.approval_status,
      actual_cost_usd:
        status === 'awaiting_approval'
          ? job.estimated_cost_usd ?? job.actual_cost_usd
          : job.actual_cost_usd,
      metadata: {
        ...prevMeta,
        archived_private: archived,
        verified_by_provider: Boolean(input.verifiedByProvider),
        published: false,
      },
    })
    .eq('id', jobId)

  if (status === 'awaiting_approval') {
    await admin.from('jarvis_notifications').insert({
      kind: 'approval',
      title: 'Video ready for approval',
      body: `Edit job ${jobId} finished rendering and awaits publish approval. Not published.`,
      link: '/admin/jarvis',
      metadata: { video_job_id: jobId, provider_job_id: input.providerJobId ?? null },
    })
  }

  await writeMarketingAudit({
    agent: 'video',
    decision: 'video_webhook_processed',
    action: 'video_webhook',
    actor_id: null,
    execution_result: redactSecrets({
      job_id: jobId,
      status,
      provider_job_id: input.providerJobId,
      archived,
      published: false,
    }) as Record<string, unknown>,
  })

  // Phase 6: associate completed/failed renders back to EDL review state
  try {
    const { markEdlRenderedFromJob } = await import('@/lib/jarvis/video/editor')
    await markEdlRenderedFromJob(jobId)
  } catch {
    /* EDL table may be absent on older envs */
  }

  return { ok: true, duplicate: false, status, archived }
}

/**
 * Shotstack callback handler: verify render ID against Shotstack API before applying state.
 * Never publishes to Instagram.
 */
export async function handleShotstackWebhookPayload(payload: {
  type?: string
  action?: string
  id?: string
  render?: string
  status?: string
  url?: string | null
  error?: string | null
  jarvis_job_id?: string | null
}): Promise<{ ok: boolean; duplicate?: boolean; status?: string; error?: string }> {
  // Serve events: optional CDN copy — prefer edit events for completion
  const renderId =
    payload.type === 'serve' ? payload.render || payload.id : payload.id
  if (!renderId) {
    return { ok: false, error: 'Missing Shotstack render id' }
  }

  const { shotstackGetRender, mapShotstackStatusToJarvis } = await import(
    '@/lib/jarvis/video/shotstack/client'
  )
  const verified = await shotstackGetRender(renderId)
  if (!verified.ok || !verified.data?.response) {
    return {
      ok: false,
      error: verified.error_message || 'Failed to verify Shotstack render',
    }
  }

  const remote = verified.data.response
  const mapped = mapShotstackStatusToJarvis(remote.status)
  const outputUrl = remote.url || payload.url || null

  if (mapped === 'completed' && !outputUrl) {
    return completeVideoJobFromWebhook({
      jobId: payload.jarvis_job_id,
      providerJobId: renderId,
      status: 'failed',
      outputVideo: null,
      error: 'Shotstack done without URL',
      verifiedByProvider: true,
    })
  }

  if (mapped === 'failed') {
    return completeVideoJobFromWebhook({
      jobId: payload.jarvis_job_id,
      providerJobId: renderId,
      status: 'failed',
      outputVideo: null,
      error: remote.error || payload.error || 'Shotstack render failed',
      verifiedByProvider: true,
    })
  }

  if (mapped === 'completed') {
    return completeVideoJobFromWebhook({
      jobId: payload.jarvis_job_id,
      providerJobId: renderId,
      status: 'completed',
      outputVideo: outputUrl,
      error: null,
      verifiedByProvider: true,
      archivePrivate: true,
    })
  }

  // Intermediate statuses
  return completeVideoJobFromWebhook({
    jobId: payload.jarvis_job_id,
    providerJobId: renderId,
    status: mapped === 'queued' ? 'queued' : 'rendering',
    outputVideo: null,
    verifiedByProvider: true,
  })
}

/** Poll Shotstack once for a job (fallback / diagnostics — not aggressive). */
export async function pollShotstackJobOnce(jobId: string) {
  const admin = createAdminClient()
  const { data: job } = await admin
    .from('video_edit_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  if (!job?.provider_job_id) {
    return { ok: false, error: 'No provider_job_id' }
  }
  if (job.provider !== 'shotstack') {
    return { ok: false, error: 'Not a Shotstack job' }
  }
  return handleShotstackWebhookPayload({
    type: 'edit',
    action: 'render',
    id: job.provider_job_id,
    jarvis_job_id: jobId,
  })
}

export async function listRecentVideoJobs(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('video_edit_jobs')
    .select(
      'id, source_ref, status, provider, provider_job_id, preset, aspect_ratio, duration_target_sec, crop_strategy, approval_status, error, created_at, completed_at, estimated_cost_usd, actual_cost_usd, metadata, output_video, analysis, edit_plan'
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  // Never expose private signed source URLs — source_video column may hold refs only
  return (data ?? []).map((row) => ({
    ...row,
    has_output: Boolean(row.output_video),
    // Soften output exposure: keep reference but flag privately
    output_video: row.output_video ? '[private-result]' : null,
    output_video_available: Boolean(row.output_video),
  }))
}

export async function findRecentSourceVideos(hint?: string) {
  const admin = createAdminClient()
  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('id, source_ref, original_filename, mime_type, byte_size, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: jobs } = await admin
    .from('video_edit_jobs')
    .select('id, source_ref, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = [
    ...(sources ?? []).map((s) => ({
      kind: 'source' as const,
      id: s.id,
      source_ref: s.source_ref,
      label: s.original_filename,
      status: null,
      created_at: s.created_at,
    })),
    ...(jobs ?? []).map((j) => ({
      kind: 'job' as const,
      id: j.id,
      source_ref: j.source_ref,
      label: j.source_ref || j.id,
      status: j.status,
      created_at: j.created_at,
    })),
  ]
  if (!hint) return rows
  const h = hint.toLowerCase()
  return rows.filter(
    (r) =>
      String(r.source_ref || '').toLowerCase().includes(h) ||
      String(r.label || '').toLowerCase().includes(h) ||
      String(r.id).toLowerCase().includes(h)
  )
}

export function buildDefaultEditPlan(overrides?: Partial<VideoEditPlan>): VideoEditPlan {
  return buildShortFormFitnessReelPlan({
    hooks: overrides?.hooks,
    clips: overrides?.clips,
    custom_instructions: overrides?.notes,
  })
}

export { MAX_RETRIES, DEFAULT_JOB_COST_USD }
