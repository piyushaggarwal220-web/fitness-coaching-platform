import { createAdminClient } from '@/lib/supabase/admin'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import {
  getVideoEditProvider,
  type VideoEditPlan,
  type VideoJobStatus,
} from '@/lib/jarvis/video/provider'

export {
  getVideoEditProvider,
  isVideoProviderConfigured,
  StubVideoEditProvider,
  HttpVideoEditProvider,
} from '@/lib/jarvis/video/provider'
export type { VideoEditProvider, VideoRenderResult, VideoEditPlan } from '@/lib/jarvis/video/provider'

export async function createVideoEditJob(input: {
  sourceVideo: string
  instructions?: Record<string, unknown>
  actorId?: string | null
  funnelId?: string | null
  requireApprovalBeforePublish?: boolean
}) {
  const admin = createAdminClient()
  const provider = getVideoEditProvider()

  if (!provider.configured || provider.name === 'stub') {
    const { data: job, error } = await admin
      .from('video_edit_jobs')
      .insert({
        source_video: input.sourceVideo,
        status: 'failed',
        edit_instructions: {
          ...(input.instructions ?? {}),
          requested: true,
        },
        provider: 'stub',
        error: 'Video editing provider is not configured.',
        approval_status: 'none',
        funnel_id: input.funnelId ?? null,
        created_by: input.actorId ?? null,
        completed_at: new Date().toISOString(),
        metadata: { available: false },
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
      execution_result: { job_id: job?.id },
    })

    return {
      id: job?.id,
      status: 'failed' as VideoJobStatus,
      provider: 'stub',
      available: false,
      error: 'Video editing provider is not configured.',
    }
  }

  const { data: job, error } = await admin
    .from('video_edit_jobs')
    .insert({
      source_video: input.sourceVideo,
      status: 'queued',
      edit_instructions: input.instructions ?? {},
      provider: provider.name,
      approval_status: input.requireApprovalBeforePublish === false ? 'none' : 'pending',
      funnel_id: input.funnelId ?? null,
      created_by: input.actorId ?? null,
    })
    .select('*')
    .maybeSingle()

  if (error || !job) throw new Error(error?.message || 'Failed to create video job')

  try {
    await admin.from('video_edit_jobs').update({ status: 'analyzing' }).eq('id', job.id)

    const result = await provider.process({
      id: job.id,
      source_video: job.source_video,
      edit_instructions: (job.edit_instructions as Record<string, unknown>) ?? {},
    })

    // Never mark completed without a real output
    let status: VideoJobStatus = result.status
    if (status === 'completed' && !result.output_video) {
      status = 'failed'
      result.error = result.error || 'Provider returned completed without output_video'
    }
    if (status === 'completed' && (input.requireApprovalBeforePublish !== false)) {
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
        edit_instructions: {
          ...((job.edit_instructions as object) ?? {}),
          ...(result.edit_plan ? { plan: result.edit_plan } : {}),
        },
        error: result.error ?? null,
        approval_status:
          status === 'awaiting_approval' ? 'pending' : job.approval_status ?? 'none',
        completed_at:
          status === 'completed' ||
          status === 'failed' ||
          status === 'awaiting_approval' ||
          status === 'review_required'
            ? new Date().toISOString()
            : null,
      })
      .eq('id', job.id)

    if (status === 'awaiting_approval') {
      await admin.from('jarvis_notifications').insert({
        kind: 'approval',
        title: 'Video ready for approval',
        body: `Edit job ${job.id} finished rendering and awaits publish approval.`,
        link: '/admin/jarvis',
        metadata: { video_job_id: job.id },
      })
    }

    await writeMarketingAudit({
      agent: 'video',
      decision: 'video_job_processed',
      action: 'video_edit',
      actor_id: input.actorId ?? null,
      execution_result: {
        job_id: job.id,
        status,
        provider: provider.name,
        has_output: Boolean(result.output_video),
      },
    })

    return {
      id: job.id,
      status,
      provider: provider.name,
      available: true,
      output_video: result.output_video ?? null,
      error: result.error ?? null,
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
      available: true,
      error: message,
    }
  }
}

export async function listRecentVideoJobs(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('video_edit_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function findRecentSourceVideos(hint?: string) {
  const admin = createAdminClient()
  const q = admin
    .from('video_edit_jobs')
    .select('id, source_video, status, created_at, output_video')
    .order('created_at', { ascending: false })
    .limit(20)
  const { data } = await q
  const rows = data ?? []
  if (!hint) return rows
  const h = hint.toLowerCase()
  return rows.filter((r) => String(r.source_video).toLowerCase().includes(h))
}

export function buildDefaultEditPlan(overrides?: Partial<VideoEditPlan>): VideoEditPlan {
  return {
    target_aspect: '9:16',
    captions: true,
    remove_silence: true,
    hooks: overrides?.hooks ?? [],
    clips: overrides?.clips ?? [],
    notes: overrides?.notes,
  }
}
