/**
 * Shotstack VideoEditProvider — REAL renders via Shotstack Edit API.
 * Never invents speech/silence/faces. Never marks completed without Shotstack confirmation.
 */

import type {
  CapabilityState,
  VideoAnalysis,
  VideoEditPlan,
  VideoEditProvider,
  VideoJobStatus,
  VideoRenderResult,
} from '@/lib/jarvis/video/provider'
import { buildShortFormFitnessReelPlan } from '@/lib/jarvis/video/presets'
import type { VideoVariantKind } from '@/lib/jarvis/video/presets'
import {
  buildShotstackCallbackUrl,
  estimateShotstackCostUsd,
  getShotstackConfig,
  mapShotstackStatusToJarvis,
  shotstackCreateRender,
  shotstackGetRender,
  shotstackProbe,
  type ShotstackErrorCode,
} from '@/lib/jarvis/video/shotstack/client'
import {
  buildShotstackEdit,
  shotstackEditMetadata,
} from '@/lib/jarvis/video/shotstack/edit-builder'

function parseFps(rate?: string): number | null {
  if (!rate) return null
  if (rate.includes('/')) {
    const [a, b] = rate.split('/').map(Number)
    if (a && b) return Math.round((a / b) * 100) / 100
  }
  const n = Number(rate)
  return Number.isFinite(n) ? n : null
}

function parseProbe(analysisUrl: string, probeJson: unknown): VideoAnalysis {
  const root = probeJson as {
    response?: {
      metadata?: {
        streams?: Array<{
          codec_type?: string
          width?: number
          height?: number
          avg_frame_rate?: string
          r_frame_rate?: string
          duration?: string
        }>
        format?: { duration?: string }
      }
    }
  }
  const streams = root?.response?.metadata?.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video')
  const audio = streams.find((s) => s.codec_type === 'audio')
  const durationRaw =
    root?.response?.metadata?.format?.duration || video?.duration || null
  const duration_sec = durationRaw != null ? Number(durationRaw) : null

  return {
    available: true,
    duration_sec: Number.isFinite(duration_sec) ? duration_sec : null,
    resolution:
      video?.width && video?.height
        ? { width: video.width, height: video.height }
        : null,
    fps: parseFps(video?.avg_frame_rate || video?.r_frame_rate),
    has_audio: Boolean(audio),
    silence_segments: null,
    speech_segments: null,
    scene_changes: null,
    candidate_cuts: null,
    framing: {
      strategy: 'center_crop',
      note: 'Shotstack fit=cover center crop for 9:16. Subject-aware framing unsupported.',
    },
    subject_position: null,
    faces: 'unsupported',
    transcript_available: 'unsupported',
    moments: [],
    notes: `Shotstack probe of source media. Speech/silence/scene/face detection unsupported by Shotstack probe.`,
    capabilities: {
      duration: 'supported',
      resolution: 'supported',
      fps: 'supported',
      audio: audio ? 'supported' : 'unsupported',
      silence: 'unsupported',
      speech: 'unsupported',
      scenes: 'unsupported',
      faces: 'unsupported',
      transcript: 'unsupported',
      reframe: 'supported',
      render: 'supported',
    },
  }
}

function failResult(
  error_code: ShotstackErrorCode | string,
  message: string,
  extra?: Partial<VideoRenderResult>
): VideoRenderResult {
  return {
    status: error_code === 'paused_budget' ? 'paused_budget' : 'failed',
    available: false,
    provider_kind: 'REAL',
    error: `${error_code}: ${message}`,
    output_video: null,
    output_variants: [],
    ...extra,
  }
}

export class ShotstackVideoEditProvider implements VideoEditProvider {
  name = 'shotstack'
  kind = 'REAL' as const
  configured: boolean

  constructor() {
    this.configured = getShotstackConfig().configured
  }

  async analyzeVideo(input: { jobId: string; sourceVideo: string }): Promise<VideoAnalysis> {
    if (!this.configured) {
      return {
        available: false,
        notes: 'Shotstack not configured (VIDEO_EDIT_API_KEY missing).',
        faces: 'unsupported',
        transcript_available: 'unsupported',
        silence_segments: null,
        speech_segments: null,
        scene_changes: null,
        candidate_cuts: null,
        capabilities: { render: 'unavailable', silence: 'unsupported', speech: 'unsupported' },
      }
    }
    const probe = await shotstackProbe(input.sourceVideo)
    if (!probe.ok || !probe.data) {
      return {
        available: false,
        notes: probe.error_message || 'Shotstack probe failed.',
        faces: 'unsupported',
        transcript_available: 'unsupported',
        silence_segments: null,
        speech_segments: null,
        scene_changes: null,
        candidate_cuts: null,
        capabilities: {
          render: 'supported',
          silence: 'unsupported',
          speech: 'unsupported',
          probe: 'unavailable',
        },
      }
    }
    return parseProbe(input.sourceVideo, probe.data)
  }

  async detectSegments(input: {
    jobId: string
    sourceVideo: string
    analysis?: VideoAnalysis
  }) {
    // Shotstack does not provide scene detection — do not invent segments
    if (input.analysis?.moments?.length) {
      return input.analysis.moments.map((m) => ({
        start_sec: m.start_sec,
        end_sec: m.end_sec,
        purpose: m.label,
      }))
    }
    return []
  }

  async removeSilence() {
    return {
      ok: false,
      note: 'Shotstack does not provide silence detection. Capability unsupported.',
      capability: 'unsupported' as CapabilityState,
    }
  }

  async createCuts(input: { jobId: string; plan: VideoEditPlan }) {
    return {
      ok: true,
      note: `Cut plan prepared for Shotstack (${input.plan.clips.length} clip(s)).`,
      capability: 'supported' as CapabilityState,
    }
  }

  async generateSubtitles() {
    return {
      note: 'Shotstack does not provide speech-to-text. Use title overlays from hooks/captions only.',
      capability: 'unsupported' as CapabilityState,
      burned_in: false,
    }
  }

  async reframeVertical(input: {
    jobId: string
    sourceVideo: string
    subjectAware?: boolean
  }) {
    return {
      ok: true,
      note: input.subjectAware
        ? 'Subject-aware reframe unsupported by Shotstack; using center crop cover fit.'
        : 'Center crop cover fit for 9:16.',
      crop_strategy: 'center_crop' as const,
      capability: 'supported' as CapabilityState,
    }
  }

  async render(input: {
    jobId: string
    sourceVideo: string
    plan: VideoEditPlan
  }): Promise<VideoRenderResult> {
    if (!this.configured) {
      return failResult('not_configured', 'VIDEO_EDIT_API_KEY missing.')
    }

    const analysis = await this.analyzeVideo({
      jobId: input.jobId,
      sourceVideo: input.sourceVideo,
    })

    const duration =
      input.plan.duration_target_sec ??
      (analysis.duration_sec != null ? Math.min(60, Math.max(7, analysis.duration_sec)) : 30)

    const estimated = estimateShotstackCostUsd(duration)

    const variant = Array.isArray((input.plan as { variants?: VideoVariantKind[] }).variants)
      ? (input.plan as { variants?: VideoVariantKind[] }).variants?.[0]
      : undefined

    const callback = buildShotstackCallbackUrl(input.jobId)
    const edit = buildShotstackEdit({
      sourceUrl: input.sourceVideo,
      plan: input.plan,
      sourceDurationSec: analysis.duration_sec,
      callbackUrl: callback,
      variant,
      captionLines: input.plan.hooks,
    })

    const created = await shotstackCreateRender(edit as unknown as Record<string, unknown>)
    if (!created.ok) {
      return failResult(
        created.error_code || 'render_failed',
        created.error_message || 'Failed to queue Shotstack render.',
        {
          analysis,
          edit_plan: input.plan,
          crop_strategy: 'center_crop',
        }
      )
    }

    const renderId = created.data?.response?.id
    if (!renderId) {
      return failResult('render_failed', 'Shotstack did not return a render id.', {
        analysis,
        edit_plan: input.plan,
      })
    }

    return {
      status: 'rendering',
      available: true,
      provider_kind: 'REAL',
      provider_job_id: renderId,
      output_video: null,
      output_variants: [],
      analysis,
      edit_plan: input.plan,
      crop_strategy: 'center_crop',
      transcript: null,
      subtitles: { burned_in: false },
      error: null,
      estimated_cost_usd: estimated,
      provider_metadata: {
        ...shotstackEditMetadata(edit),
        shotstack_callback: Boolean(callback),
      },
    }
  }

  async cancel() {
    return {
      ok: false,
      status: 'cancelled' as VideoJobStatus,
      note: 'Shotstack does not support cancelling an in-flight render via API; Jarvis marked cancel locally only.',
    }
  }

  async getStatus(providerJobId: string) {
    const res = await shotstackGetRender(providerJobId)
    if (!res.ok) {
      return {
        status: 'failed' as const,
        error: res.error_message || res.error_code,
      }
    }
    const mapped = mapShotstackStatusToJarvis(res.data?.response?.status)
    return {
      status: mapped as VideoJobStatus,
      error: res.data?.response?.error || undefined,
    }
  }

  async getResult(providerJobId: string): Promise<VideoRenderResult> {
    const res = await shotstackGetRender(providerJobId)
    if (!res.ok) {
      return failResult(res.error_code || 'render_failed', res.error_message || 'Status failed.')
    }
    const status = mapShotstackStatusToJarvis(res.data?.response?.status)
    const url = res.data?.response?.url || null
    if (status === 'completed') {
      if (!url) {
        return failResult('render_failed', 'Shotstack status done but no output URL.')
      }
      return {
        status: 'completed',
        available: true,
        provider_kind: 'REAL',
        provider_job_id: providerJobId,
        output_video: url,
        error: null,
      }
    }
    if (status === 'failed') {
      return failResult(
        'render_failed',
        res.data?.response?.error || 'Shotstack render failed.'
      )
    }
    return {
      status: status === 'queued' ? 'queued' : 'rendering',
      available: true,
      provider_kind: 'REAL',
      provider_job_id: providerJobId,
      output_video: null,
      error: null,
    }
  }

  async process(job: {
    id: string
    source_video: string
    edit_instructions: Record<string, unknown>
  }): Promise<VideoRenderResult> {
    if (!this.configured) {
      return failResult('not_configured', 'VIDEO_EDIT_API_KEY missing.')
    }

    const analysis = await this.analyzeVideo({
      jobId: job.id,
      sourceVideo: job.source_video,
    })

    const clips = await this.detectSegments({
      jobId: job.id,
      sourceVideo: job.source_video,
      analysis,
    })

    const plan = buildShortFormFitnessReelPlan({
      hooks: Array.isArray(job.edit_instructions.hooks)
        ? (job.edit_instructions.hooks as string[])
        : [],
      clips:
        clips.length > 0
          ? clips
          : analysis.duration_sec
            ? [
                {
                  start_sec: 0,
                  end_sec: Math.min(
                    60,
                    Math.max(
                      7,
                      typeof job.edit_instructions.duration_target_sec === 'number'
                        ? job.edit_instructions.duration_target_sec
                        : Math.min(30, analysis.duration_sec)
                    )
                  ),
                  purpose: 'main',
                },
              ]
            : [],
      custom_instructions:
        typeof job.edit_instructions.custom_instructions === 'string'
          ? job.edit_instructions.custom_instructions
          : undefined,
      duration_target_sec:
        typeof job.edit_instructions.duration_target_sec === 'number'
          ? job.edit_instructions.duration_target_sec
          : null,
      crop_strategy: 'center_crop',
      variants: Array.isArray(job.edit_instructions.variants)
        ? (job.edit_instructions.variants as VideoVariantKind[]).slice(0, 3)
        : [],
    })

    await this.createCuts({ jobId: job.id, plan })
    const reframe = await this.reframeVertical({
      jobId: job.id,
      sourceVideo: job.source_video,
      subjectAware: true,
    })
    const subs = await this.generateSubtitles()

    // Variants: only first render here; additional variants require explicit separate jobs
    const rendered = await this.render({
      jobId: job.id,
      sourceVideo: job.source_video,
      plan: { ...plan, crop_strategy: reframe.crop_strategy },
    })

    return {
      ...rendered,
      analysis,
      edit_plan: plan,
      transcript: null,
      subtitles: {
        burned_in: false,
        style: plan.subtitle_style,
        srt: undefined,
      },
      crop_strategy: reframe.crop_strategy,
      error: rendered.error
        ? rendered.error
        : subs.capability === 'unsupported'
          ? null
          : rendered.error,
    }
  }
}

export function describeShotstackConnection(): {
  configured: boolean
  provider: 'shotstack'
  kind: 'REAL' | 'STUB'
  stage: string
  missing: string[]
  note: string
  callback_configured: boolean
} {
  const cfg = getShotstackConfig()
  return {
    configured: cfg.configured,
    provider: 'shotstack',
    kind: cfg.configured ? 'REAL' : 'STUB',
    stage: cfg.stage,
    missing: cfg.missing,
    callback_configured: Boolean(cfg.callbackUrl),
    note: cfg.configured
      ? `Shotstack connected (edit/${cfg.stage}). Callback ${cfg.callbackUrl ? 'configured' : 'not set — status polling fallback available'}.`
      : 'VIDEO PROVIDER: NOT CONNECTED — set VIDEO_EDIT_PROVIDER=shotstack and VIDEO_EDIT_API_KEY.',
  }
}
