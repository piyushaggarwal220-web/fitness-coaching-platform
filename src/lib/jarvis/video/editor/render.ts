/**
 * EDL → validate → cost → resolve sources → Shotstack → video_edit_jobs.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordCostUsage } from '@/lib/jarvis/cost/usage'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { resolveSourceForProvider } from '@/lib/jarvis/video/sources'
import {
  buildShotstackCallbackUrl,
  getShotstackConfig,
  shotstackCreateRender,
} from '@/lib/jarvis/video/shotstack/client'
import { getVideoEditProvider } from '@/lib/jarvis/video/provider'
import { SHORT_FORM_FITNESS_REEL_PRESET } from '@/lib/jarvis/video/presets'
import { validateEdl } from '@/lib/jarvis/video/editor/validator'
import { estimateEdlRenderCostUsd, gateEdlRenderBudget } from '@/lib/jarvis/video/editor/cost'
import {
  translateEdlToShotstack,
  shotstackTranslateMetadata,
} from '@/lib/jarvis/video/editor/providers/shotstack-translator'
import { loadEdl, saveEdl, updateEdlStatus, findEdlByFingerprint } from '@/lib/jarvis/video/editor/store'
import type { EditDecisionList } from '@/lib/jarvis/video/editor/types'
import { createEdlFromCreative } from '@/lib/jarvis/video/editor/planner'

function redact(obj: unknown): unknown {
  if (typeof obj === 'string') {
    if (/https?:\/\/.+/i.test(obj) && obj.length > 80) return '[redacted-url]'
    return obj
  }
  if (Array.isArray(obj)) return obj.map(redact)
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (/secret|token|api[_-]?key|authorization|password|src/i.test(k)) out[k] = '[REDACTED]'
      else out[k] = redact(v)
    }
    return out
  }
  return obj
}

export async function createAndPersistEdl(input: {
  creative_id: string
  actorId?: string | null
  force_new?: boolean
}): Promise<{
  ok: boolean
  edl_id: string | null
  edl: EditDecisionList | null
  validation: ReturnType<typeof validateEdl> | null
  note: string
  duplicate?: boolean
}> {
  const planned = await createEdlFromCreative({
    creative_id: input.creative_id,
    actorId: input.actorId,
    force_new: input.force_new,
  })
  if (!planned.ok || !planned.edl) {
    return {
      ok: false,
      edl_id: null,
      edl: null,
      validation: null,
      note: planned.note,
    }
  }

  if (!input.force_new && planned.edl.fingerprint) {
    const existing = await findEdlByFingerprint(planned.edl.fingerprint, 1)
    if (existing) {
      const loaded = await loadEdl(existing)
      return {
        ok: true,
        edl_id: existing,
        edl: loaded?.edl ?? planned.edl,
        validation: validateEdl(loaded?.edl ?? planned.edl),
        note: 'Idempotent: existing EDL fingerprint reused',
        duplicate: true,
      }
    }
  }

  const validation = validateEdl(planned.edl)
  planned.edl.status = validation.ok
    ? 'READY_TO_RENDER'
    : validation.status === 'MISSING_FOOTAGE'
      ? 'MISSING_FOOTAGE'
      : 'DRAFT'
  planned.edl.warnings = [...new Set([...planned.edl.warnings, ...validation.warnings])]

  const saved = await saveEdl({ edl: planned.edl, actorId: input.actorId })
  planned.edl.id = saved.id

  return {
    ok: true,
    edl_id: saved.id,
    edl: planned.edl,
    validation,
    note: planned.note,
  }
}

export async function renderEdl(input: {
  edl_id: string
  actorId?: string | null
}): Promise<{
  ok: boolean
  status: string
  job_id: string | null
  provider_job_id: string | null
  estimated_cost_usd: number
  note: string
  error?: string
  duplicate?: boolean
}> {
  const loaded = await loadEdl(input.edl_id)
  if (!loaded) {
    return {
      ok: false,
      status: 'FAILED',
      job_id: null,
      provider_job_id: null,
      estimated_cost_usd: 0,
      note: 'EDL not found',
      error: 'EDL_NOT_FOUND',
    }
  }

  const edl = loaded.edl
  const validation = validateEdl(edl)
  if (!validation.ok) {
    await updateEdlStatus(
      loaded.id,
      validation.status === 'MISSING_FOOTAGE' ? 'MISSING_FOOTAGE' : 'FAILED',
      { warnings: validation.errors }
    )
    return {
      ok: false,
      status: validation.status,
      job_id: null,
      provider_job_id: null,
      estimated_cost_usd: 0,
      note: validation.errors.join('; '),
      error: 'VALIDATION_FAILED',
    }
  }

  const estimated = estimateEdlRenderCostUsd(edl.estimated_duration_ms || 15000)
  const gate = await gateEdlRenderBudget(estimated)
  if (!gate.ok) {
    await updateEdlStatus(loaded.id, 'PAUSED_BUDGET')
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      job_id: null,
      provider_job_id: null,
      estimated_cost_usd: estimated,
      note: gate.reason || 'Budget exhausted',
      error: 'PAUSED_BUDGET',
    }
  }

  const idempotencyKey = createHash('sha256')
    .update(`${loaded.id}:v${loaded.version}:render`)
    .digest('hex')
    .slice(0, 32)

  const admin = createAdminClient()
  const { data: existingJob } = await admin
    .from('video_edit_jobs')
    .select('id, status, provider_job_id')
    .eq('render_idempotency_key', idempotencyKey)
    .maybeSingle()

  if (
    existingJob &&
    ['queued', 'rendering', 'processing', 'editing', 'analyzing', 'completed'].includes(
      existingJob.status
    )
  ) {
    return {
      ok: true,
      status: existingJob.status,
      job_id: existingJob.id,
      provider_job_id: existingJob.provider_job_id,
      estimated_cost_usd: estimated,
      note: 'Idempotent: render already submitted for this EDL version',
      duplicate: true,
    }
  }

  const provider = getVideoEditProvider()
  const shotstackCfg = getShotstackConfig()
  if (!provider.configured || provider.kind === 'STUB' || !shotstackCfg.configured) {
    await updateEdlStatus(loaded.id, 'FAILED')
    return {
      ok: false,
      status: 'PROVIDER_UNAVAILABLE',
      job_id: null,
      provider_job_id: null,
      estimated_cost_usd: estimated,
      note: 'Shotstack / video edit provider not configured',
      error: 'PROVIDER_UNAVAILABLE',
    }
  }

  // Resolve each unique source_ref to signed URL
  const urlByRef: Record<string, string> = {}
  for (const entry of edl.source_manifest) {
    if (!entry.source_ref) continue
    const resolved = await resolveSourceForProvider(entry.source_ref)
    if (!resolved.ok || !resolved.private_fetch_url) {
      return {
        ok: false,
        status: 'FAILED',
        job_id: null,
        provider_job_id: null,
        estimated_cost_usd: estimated,
        note: `Failed to resolve source ${entry.source_ref}: ${resolved.error}`,
        error: 'SOURCE_RESOLVE_FAILED',
      }
    }
    urlByRef[entry.source_ref] = resolved.private_fetch_url
  }

  // Create job row first so callback can include jarvis_job_id
  const primaryRef = edl.source_manifest[0]?.source_ref || 'multi-source'
  const { data: job, error: jobErr } = await admin
    .from('video_edit_jobs')
    .insert({
      source_video: primaryRef,
      source_ref: primaryRef,
      status: 'queued',
      edit_instructions: {
        edl_id: loaded.id,
        edl_version: loaded.version,
        phase: 6,
        preset: SHORT_FORM_FITNESS_REEL_PRESET,
      },
      edit_plan: { edl_id: loaded.id, version: loaded.version },
      provider: provider.name,
      approval_status: 'none',
      created_by: input.actorId ?? null,
      estimated_cost_usd: estimated,
      preset: SHORT_FORM_FITNESS_REEL_PRESET,
      aspect_ratio: edl.aspect_ratio,
      duration_target_sec: edl.target_duration_ms != null ? edl.target_duration_ms / 1000 : null,
      edl_id: loaded.id,
      edl_version: loaded.version,
      render_idempotency_key: idempotencyKey,
      crop_strategy: 'center_crop',
      metadata: { phase: 6, edl_driven: true },
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return {
      ok: false,
      status: 'FAILED',
      job_id: null,
      provider_job_id: null,
      estimated_cost_usd: estimated,
      note: jobErr?.message || 'Failed to create video_edit_jobs row',
      error: 'JOB_CREATE_FAILED',
    }
  }

  const callback = buildShotstackCallbackUrl(job.id)
  const translated = translateEdlToShotstack({
    edl,
    sourceUrlByRef: urlByRef,
    callbackUrl: callback,
  })

  if (!translated.ok || !translated.edit) {
    await admin
      .from('video_edit_jobs')
      .update({
        status: 'failed',
        error: translated.errors.join('; '),
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    await updateEdlStatus(loaded.id, 'FAILED')
    return {
      ok: false,
      status: 'FAILED',
      job_id: job.id,
      provider_job_id: null,
      estimated_cost_usd: estimated,
      note: translated.errors.join('; '),
      error: 'TRANSLATE_FAILED',
    }
  }

  const created = await shotstackCreateRender(
    translated.edit as unknown as Record<string, unknown>
  )
  if (!created.ok) {
    await admin
      .from('video_edit_jobs')
      .update({
        status: 'failed',
        error: created.error_message || created.error_code,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    await updateEdlStatus(loaded.id, 'FAILED')
    return {
      ok: false,
      status: 'PROVIDER_UNAVAILABLE',
      job_id: job.id,
      provider_job_id: null,
      estimated_cost_usd: estimated,
      note: created.error_message || 'Shotstack render submit failed',
      error: created.error_code || 'render_failed',
    }
  }

  const renderId = created.data?.response?.id
  if (!renderId) {
    await admin
      .from('video_edit_jobs')
      .update({
        status: 'failed',
        error: 'No render id',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    return {
      ok: false,
      status: 'FAILED',
      job_id: job.id,
      provider_job_id: null,
      estimated_cost_usd: estimated,
      note: 'Shotstack did not return render id',
      error: 'NO_RENDER_ID',
    }
  }

  await admin
    .from('video_edit_jobs')
    .update({
      status: 'rendering',
      provider_job_id: renderId,
      metadata: redact({
        phase: 6,
        edl_driven: true,
        shotstack: shotstackTranslateMetadata(translated.edit),
        unsupported: translated.unsupported,
      }),
    })
    .eq('id', job.id)

  await updateEdlStatus(loaded.id, 'RENDERING')

  await recordCostUsage({
    toolName: 'video.render_edl',
    category: 'video',
    costUsd: estimated,
    metadata: { edl_id: loaded.id, job_id: job.id },
  }).catch(() => null)

  await writeMarketingAudit({
    agent: 'video_editor',
    decision: 'edl_render_submitted',
    action: 'video.render_edl',
    actor_id: input.actorId ?? null,
    execution_result: redact({
      edl_id: loaded.id,
      job_id: job.id,
      provider_job_id: renderId,
      estimated,
    }) as Record<string, unknown>,
  })

  return {
    ok: true,
    status: 'RENDERING',
    job_id: job.id,
    provider_job_id: renderId,
    estimated_cost_usd: estimated,
    note: 'Render submitted to Shotstack. Awaiting webhook/poll. Not published.',
  }
}

export async function markEdlRenderedFromJob(jobId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: job } = await admin
    .from('video_edit_jobs')
    .select('edl_id, status')
    .eq('id', jobId)
    .maybeSingle()
  if (!job?.edl_id) return
  if (job.status === 'completed' || job.status === 'awaiting_approval') {
    await updateEdlStatus(job.edl_id, 'REVIEW')
  } else if (job.status === 'failed') {
    await updateEdlStatus(job.edl_id, 'FAILED')
  }
}
