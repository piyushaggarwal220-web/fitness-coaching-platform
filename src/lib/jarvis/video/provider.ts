/**
 * Real video edit provider architecture for Jarvis.
 * Stub never claims a successful render. HTTP provider delegates to an external service.
 * Test provider is deterministic for verify scripts — clearly labeled TEST, not REAL.
 */

import {
  buildShortFormFitnessReelPlan,
  SHORT_FORM_FITNESS_REEL_PRESET,
} from '@/lib/jarvis/video/presets'
import {
  ShotstackVideoEditProvider,
  describeShotstackConnection,
} from '@/lib/jarvis/video/shotstack/provider'

export type VideoJobStatus =
  | 'queued'
  | 'analyzing'
  | 'editing'
  | 'rendering'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused_budget'
  | 'review_required'
  | 'awaiting_approval'

export type CapabilityState = 'supported' | 'unsupported' | 'unavailable'

export type VideoAnalysis = {
  duration_sec?: number | null
  resolution?: { width: number; height: number } | null
  fps?: number | null
  has_audio?: boolean | null
  silence_segments?: { start_sec: number; end_sec: number; confidence?: number }[] | null
  speech_segments?: { start_sec: number; end_sec: number }[] | null
  scene_changes?: number[] | null
  candidate_cuts?: { start_sec: number; end_sec: number; reason: string }[] | null
  framing?: { strategy: string; note: string } | null
  subject_position?: { x: number; y: number; confidence?: number } | null
  faces?: CapabilityState
  transcript_available?: CapabilityState
  moments?: { start_sec: number; end_sec: number; label: string; score?: number }[]
  notes?: string
  available: boolean
  capabilities?: Record<string, CapabilityState>
}

export type VideoEditPlan = {
  target_aspect: '9:16' | '1:1' | '16:9'
  captions: boolean
  remove_silence: boolean
  hooks: string[]
  clips: { start_sec: number; end_sec: number; purpose: string }[]
  notes?: string
  preset?: string
  crop_strategy?: 'subject_aware' | 'center_crop' | 'unsupported'
  duration_target_sec?: number | null
}

export type VideoRenderResult = {
  status: VideoJobStatus
  output_video?: string | null
  output_variants?: { url: string; label: string; aspect?: string }[]
  transcript?: string | null
  subtitles?: { srt?: string; style?: Record<string, unknown>; burned_in: boolean } | null
  analysis?: VideoAnalysis
  edit_plan?: VideoEditPlan
  provider_job_id?: string | null
  crop_strategy?: string | null
  error?: string | null
  available: boolean
  provider_kind?: 'REAL' | 'TEST' | 'STUB'
  estimated_cost_usd?: number | null
  provider_metadata?: Record<string, unknown>
}

export interface VideoEditProvider {
  name: string
  configured: boolean
  kind: 'REAL' | 'TEST' | 'STUB'
  analyzeVideo(input: {
    jobId: string
    sourceVideo: string
  }): Promise<VideoAnalysis>
  detectSegments(input: {
    jobId: string
    sourceVideo: string
    analysis?: VideoAnalysis
  }): Promise<VideoEditPlan['clips']>
  removeSilence(input: {
    jobId: string
    sourceVideo: string
  }): Promise<{ ok: boolean; note: string; capability: CapabilityState }>
  createCuts(input: {
    jobId: string
    plan: VideoEditPlan
  }): Promise<{ ok: boolean; note: string; capability: CapabilityState }>
  generateSubtitles(input: {
    jobId: string
    sourceVideo: string
  }): Promise<{
    transcript?: string
    srt?: string
    note: string
    capability: CapabilityState
    burned_in: boolean
  }>
  reframeVertical(input: {
    jobId: string
    sourceVideo: string
    subjectAware?: boolean
  }): Promise<{
    ok: boolean
    note: string
    crop_strategy: 'subject_aware' | 'center_crop' | 'unsupported'
    capability: CapabilityState
  }>
  render(input: {
    jobId: string
    sourceVideo: string
    plan: VideoEditPlan
  }): Promise<VideoRenderResult>
  cancel?(providerJobId: string): Promise<{ ok: boolean; status: VideoJobStatus; note: string }>
  getStatus(providerJobId: string): Promise<{ status: VideoJobStatus; error?: string }>
  getResult(providerJobId: string): Promise<VideoRenderResult>
  /** Full pipeline convenience used by job runner */
  process(job: {
    id: string
    source_video: string
    edit_instructions: Record<string, unknown>
  }): Promise<VideoRenderResult>
}

function unsupportedAnalysis(notes: string): VideoAnalysis {
  return {
    available: false,
    notes,
    moments: [],
    silence_segments: null,
    speech_segments: null,
    scene_changes: null,
    candidate_cuts: null,
    framing: null,
    subject_position: null,
    faces: 'unsupported',
    transcript_available: 'unsupported',
    capabilities: {
      silence: 'unsupported',
      speech: 'unsupported',
      scenes: 'unsupported',
      faces: 'unsupported',
      transcript: 'unsupported',
      reframe: 'unsupported',
      render: 'unsupported',
    },
  }
}

export class StubVideoEditProvider implements VideoEditProvider {
  name = 'stub'
  configured = false
  kind = 'STUB' as const

  async analyzeVideo() {
    return unsupportedAnalysis(
      'Video editing provider is not configured. Set VIDEO_EDIT_PROVIDER=http and VIDEO_EDIT_WEBHOOK_URL.'
    )
  }

  async detectSegments() {
    return []
  }

  async removeSilence() {
    return {
      ok: false,
      note: 'Video editing provider is not configured.',
      capability: 'unavailable' as const,
    }
  }

  async createCuts() {
    return {
      ok: false,
      note: 'Video editing provider is not configured.',
      capability: 'unavailable' as const,
    }
  }

  async generateSubtitles() {
    return {
      note: 'Video editing provider is not configured.',
      capability: 'unavailable' as const,
      burned_in: false,
    }
  }

  async reframeVertical() {
    return {
      ok: false,
      note: 'Video editing provider is not configured.',
      crop_strategy: 'unsupported' as const,
      capability: 'unavailable' as const,
    }
  }

  async render(): Promise<VideoRenderResult> {
    return {
      status: 'failed',
      available: false,
      provider_kind: 'STUB',
      error: 'Video editing provider is not configured.',
      output_video: null,
      output_variants: [],
      subtitles: { burned_in: false },
    }
  }

  async cancel() {
    return {
      ok: false,
      status: 'cancelled' as const,
      note: 'No provider job to cancel (stub).',
    }
  }

  async getStatus() {
    return { status: 'failed' as const, error: 'Video editing provider is not configured.' }
  }

  async getResult() {
    return this.render()
  }

  async process(_job: {
    id: string
    source_video: string
    edit_instructions: Record<string, unknown>
  }): Promise<VideoRenderResult> {
    return {
      status: 'failed',
      available: false,
      provider_kind: 'STUB',
      error: 'Video editing provider is not configured.',
      analysis: unsupportedAnalysis(
        'Set VIDEO_EDIT_PROVIDER=http and VIDEO_EDIT_WEBHOOK_URL to enable real processing.'
      ),
      edit_plan: buildShortFormFitnessReelPlan(),
      output_video: null,
      output_variants: [],
      transcript: null,
      subtitles: { burned_in: false },
      crop_strategy: 'unsupported',
    }
  }
}

/**
 * Deterministic TEST provider — for verify scripts only.
 * Can simulate analysis/render when VIDEO_EDIT_PROVIDER=test.
 * Never used as a substitute for REAL production renders unless explicitly configured.
 */
export class TestVideoEditProvider implements VideoEditProvider {
  name = 'test'
  configured = true
  kind = 'TEST' as const
  private jobs = new Map<string, VideoRenderResult>()

  async analyzeVideo(_input: { jobId: string; sourceVideo: string }): Promise<VideoAnalysis> {
    return {
      available: true,
      duration_sec: 42,
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      has_audio: true,
      silence_segments: [{ start_sec: 10, end_sec: 12.5, confidence: 0.9 }],
      speech_segments: [
        { start_sec: 0, end_sec: 10 },
        { start_sec: 12.5, end_sec: 42 },
      ],
      scene_changes: [0, 8, 20],
      candidate_cuts: [{ start_sec: 10, end_sec: 12.5, reason: 'silence' }],
      framing: { strategy: 'center_crop_fallback', note: 'TEST: subject detection simulated as unavailable' },
      subject_position: null,
      faces: 'unsupported',
      transcript_available: 'supported',
      moments: [{ start_sec: 0, end_sec: 7, label: 'hook', score: 0.8 }],
      notes: `TEST analysis for ${_input.jobId}`,
      capabilities: {
        silence: 'supported',
        speech: 'supported',
        scenes: 'supported',
        faces: 'unsupported',
        transcript: 'supported',
        reframe: 'supported',
        render: 'supported',
      },
    }
  }

  async detectSegments(input: {
    jobId: string
    sourceVideo: string
    analysis?: VideoAnalysis
  }) {
    return (
      input.analysis?.moments?.map((m) => ({
        start_sec: m.start_sec,
        end_sec: m.end_sec,
        purpose: m.label,
      })) ?? [{ start_sec: 0, end_sec: 30, purpose: 'main' }]
    )
  }

  async removeSilence(_input: { jobId: string; sourceVideo: string }) {
    return { ok: true, note: 'TEST: silence marked for removal', capability: 'supported' as const }
  }

  async createCuts(_input: { jobId: string; plan: VideoEditPlan }) {
    return { ok: true, note: 'TEST: cuts planned', capability: 'supported' as const }
  }

  async generateSubtitles(_input: { jobId: string; sourceVideo: string }) {
    return {
      transcript: 'TEST transcript: Keep elbows tucked and control the negative.',
      srt: '1\n00:00:00,000 --> 00:00:03,000\nKeep elbows tucked\n',
      note: 'TEST subtitles',
      capability: 'supported' as const,
      burned_in: false,
    }
  }

  async reframeVertical(_input: {
    jobId: string
    sourceVideo: string
    subjectAware?: boolean
  }) {
    return {
      ok: true,
      note: _input.subjectAware
        ? 'TEST: subject-aware requested; falling back to center crop (faces unsupported)'
        : 'TEST: center crop 9:16',
      crop_strategy: 'center_crop' as const,
      capability: 'supported' as const,
    }
  }

  async render(input: {
    jobId: string
    sourceVideo: string
    plan: VideoEditPlan
  }): Promise<VideoRenderResult> {
    const provider_job_id = `test-${input.jobId}`
    const result: VideoRenderResult = {
      status: 'completed',
      available: true,
      provider_kind: 'TEST',
      provider_job_id,
      output_video: `test-output://${input.jobId}.mp4`,
      output_variants: [],
      transcript: 'TEST transcript: Keep elbows tucked and control the negative.',
      subtitles: {
        srt: '1\n00:00:00,000 --> 00:00:03,000\nKeep elbows tucked\n',
        burned_in: true,
        style: { max_chars_per_line: 32 },
      },
      edit_plan: input.plan,
      crop_strategy: input.plan.crop_strategy ?? 'center_crop',
    }
    this.jobs.set(provider_job_id, result)
    return result
  }

  async cancel(providerJobId: string) {
    const existing = this.jobs.get(providerJobId)
    if (existing) {
      existing.status = 'cancelled'
      existing.output_video = null
      this.jobs.set(providerJobId, existing)
    }
    return { ok: true, status: 'cancelled' as const, note: 'TEST job cancelled' }
  }

  async getStatus(providerJobId: string) {
    const j = this.jobs.get(providerJobId)
    return { status: j?.status ?? ('failed' as const), error: j ? undefined : 'unknown test job' }
  }

  async getResult(providerJobId: string) {
    return (
      this.jobs.get(providerJobId) ?? {
        status: 'failed' as const,
        available: false,
        provider_kind: 'TEST' as const,
        error: 'unknown test job',
        output_video: null,
      }
    )
  }

  async process(job: {
    id: string
    source_video: string
    edit_instructions: Record<string, unknown>
  }): Promise<VideoRenderResult> {
    const analysis = await this.analyzeVideo({ jobId: job.id, sourceVideo: job.source_video })
    const clips = await this.detectSegments({
      jobId: job.id,
      sourceVideo: job.source_video,
      analysis,
    })
    const plan = buildShortFormFitnessReelPlan({
      hooks: Array.isArray(job.edit_instructions.hooks)
        ? (job.edit_instructions.hooks as string[])
        : [],
      clips,
      custom_instructions:
        typeof job.edit_instructions.custom_instructions === 'string'
          ? job.edit_instructions.custom_instructions
          : undefined,
      duration_target_sec:
        typeof job.edit_instructions.duration_target_sec === 'number'
          ? job.edit_instructions.duration_target_sec
          : null,
      crop_strategy: 'center_crop',
    })
    await this.removeSilence({ jobId: job.id, sourceVideo: job.source_video })
    await this.createCuts({ jobId: job.id, plan })
    const reframe = await this.reframeVertical({
      jobId: job.id,
      sourceVideo: job.source_video,
      subjectAware: true,
    })
    const subs = await this.generateSubtitles({ jobId: job.id, sourceVideo: job.source_video })
    const rendered = await this.render({
      jobId: job.id,
      sourceVideo: job.source_video,
      plan: { ...plan, crop_strategy: reframe.crop_strategy },
    })
    return {
      ...rendered,
      analysis,
      edit_plan: plan,
      transcript: subs.transcript ?? null,
      subtitles: {
        srt: subs.srt,
        burned_in: true,
        style: plan.subtitle_style,
      },
      crop_strategy: reframe.crop_strategy,
    }
  }
}

/**
 * HTTP webhook provider — posts job to an external editor and polls status.
 * Never invents output URLs.
 */
export class HttpVideoEditProvider implements VideoEditProvider {
  name = 'http'
  configured: boolean
  kind = 'REAL' as const
  private webhookUrl: string
  private statusUrl: string | null
  private apiKey: string | null

  constructor() {
    this.webhookUrl = process.env.VIDEO_EDIT_WEBHOOK_URL?.trim() || ''
    this.statusUrl = process.env.VIDEO_EDIT_STATUS_URL?.trim() || null
    this.apiKey = process.env.VIDEO_EDIT_API_KEY?.trim() || null
    this.configured = Boolean(this.webhookUrl)
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`
    return h
  }

  async analyzeVideo(input: { jobId: string; sourceVideo: string }) {
    if (!this.configured) {
      return unsupportedAnalysis('VIDEO_EDIT_WEBHOOK_URL missing')
    }
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ action: 'analyze', job_id: input.jobId, source_video: input.sourceVideo }),
    })
    if (!res.ok) {
      return { ...unsupportedAnalysis(`Analyze failed (${res.status})`), available: false }
    }
    const json = (await res.json()) as VideoAnalysis
    return { ...json, available: true }
  }

  async detectSegments(input: {
    jobId: string
    sourceVideo: string
    analysis?: VideoAnalysis
  }) {
    return (
      input.analysis?.moments?.map((m) => ({
        start_sec: m.start_sec,
        end_sec: m.end_sec,
        purpose: m.label,
      })) ??
      input.analysis?.candidate_cuts?.map((c) => ({
        start_sec: c.start_sec,
        end_sec: c.end_sec,
        purpose: c.reason,
      })) ??
      []
    )
  }

  async removeSilence() {
    return { ok: true, note: 'Delegated to provider pipeline', capability: 'supported' as const }
  }

  async createCuts() {
    return { ok: true, note: 'Delegated to provider pipeline', capability: 'supported' as const }
  }

  async generateSubtitles(input: { jobId: string; sourceVideo: string }) {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        action: 'subtitles',
        job_id: input.jobId,
        source_video: input.sourceVideo,
      }),
    })
    if (!res.ok) {
      return {
        note: `Subtitles failed (${res.status})`,
        capability: 'unavailable' as const,
        burned_in: false,
      }
    }
    const json = (await res.json()) as { transcript?: string; srt?: string; note?: string }
    return {
      transcript: json.transcript,
      srt: json.srt,
      note: json.note || 'Subtitles from provider',
      capability: 'supported' as const,
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
        ? 'Subject-aware reframe requested; provider may fall back to center crop'
        : 'Center crop 9:16',
      crop_strategy: (input.subjectAware ? 'subject_aware' : 'center_crop') as
        | 'subject_aware'
        | 'center_crop',
      capability: 'supported' as const,
    }
  }

  async render(input: {
    jobId: string
    sourceVideo: string
    plan: VideoEditPlan
  }): Promise<VideoRenderResult> {
    if (!this.configured) {
      return {
        status: 'failed',
        available: false,
        provider_kind: 'REAL',
        error: 'VIDEO_EDIT_WEBHOOK_URL not configured',
      }
    }
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        action: 'render',
        job_id: input.jobId,
        source_video: input.sourceVideo,
        plan: input.plan,
        preset: input.plan.preset ?? SHORT_FORM_FITNESS_REEL_PRESET,
      }),
    })
    if (!res.ok) {
      return {
        status: 'failed',
        available: false,
        provider_kind: 'REAL',
        error: `Render request failed (${res.status})`,
      }
    }
    const json = (await res.json()) as VideoRenderResult
    if (!json.output_video && json.status === 'completed') {
      return {
        ...json,
        status: 'failed',
        available: false,
        provider_kind: 'REAL',
        error: 'Provider claimed completed without output_video',
      }
    }
    return { ...json, available: true, provider_kind: 'REAL' }
  }

  async cancel(providerJobId: string) {
    if (!this.configured) {
      return { ok: false, status: 'failed' as const, note: 'Provider not configured' }
    }
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ action: 'cancel', provider_job_id: providerJobId }),
    })
    if (!res.ok) {
      return { ok: false, status: 'failed' as const, note: `Cancel failed (${res.status})` }
    }
    return { ok: true, status: 'cancelled' as const, note: 'Cancel requested' }
  }

  async getStatus(providerJobId: string) {
    if (!this.statusUrl) {
      return { status: 'processing' as const }
    }
    const url = `${this.statusUrl.replace(/\/$/, '')}/${encodeURIComponent(providerJobId)}`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) return { status: 'failed' as const, error: `Status ${res.status}` }
    return (await res.json()) as { status: VideoJobStatus; error?: string }
  }

  async getResult(providerJobId: string): Promise<VideoRenderResult> {
    const status = await this.getStatus(providerJobId)
    if (status.status !== 'completed') {
      return {
        status: status.status,
        available: this.configured,
        provider_kind: 'REAL',
        error: status.error,
        output_video: null,
      }
    }
    if (!this.statusUrl) {
      return {
        status: 'failed',
        available: false,
        provider_kind: 'REAL',
        error: 'VIDEO_EDIT_STATUS_URL required to fetch results',
      }
    }
    const url = `${this.statusUrl.replace(/\/$/, '')}/${encodeURIComponent(providerJobId)}/result`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) {
      return { status: 'failed', available: false, provider_kind: 'REAL', error: `Result ${res.status}` }
    }
    const json = (await res.json()) as VideoRenderResult
    if (!json.output_video) {
      return {
        status: 'failed',
        available: false,
        provider_kind: 'REAL',
        error: 'Provider result missing output_video',
      }
    }
    return { ...json, available: true, status: 'completed', provider_kind: 'REAL' }
  }

  async process(job: {
    id: string
    source_video: string
    edit_instructions: Record<string, unknown>
  }): Promise<VideoRenderResult> {
    if (!this.configured) {
      return new StubVideoEditProvider().process(job)
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
      clips,
      custom_instructions:
        typeof job.edit_instructions.custom_instructions === 'string'
          ? job.edit_instructions.custom_instructions
          : undefined,
      duration_target_sec:
        typeof job.edit_instructions.duration_target_sec === 'number'
          ? job.edit_instructions.duration_target_sec
          : null,
      crop_strategy: 'subject_aware',
      variants: Array.isArray(job.edit_instructions.variants)
        ? (job.edit_instructions.variants as ('fast_cuts' | 'clean_educational' | 'high_retention')[])
        : [],
    })
    const reframe = await this.reframeVertical({
      jobId: job.id,
      sourceVideo: job.source_video,
      subjectAware: true,
    })
    const subs = await this.generateSubtitles({
      jobId: job.id,
      sourceVideo: job.source_video,
    })
    const rendered = await this.render({
      jobId: job.id,
      sourceVideo: job.source_video,
      plan: { ...plan, crop_strategy: reframe.crop_strategy },
    })
    return {
      ...rendered,
      analysis,
      edit_plan: plan,
      transcript: subs.transcript ?? rendered.transcript ?? null,
      subtitles: {
        srt: subs.srt,
        burned_in: Boolean(rendered.output_video && rendered.status === 'completed'),
        style: plan.subtitle_style,
      },
      crop_strategy: reframe.crop_strategy,
    }
  }
}

export function getVideoEditProvider(): VideoEditProvider {
  const name = process.env.VIDEO_EDIT_PROVIDER?.trim() || 'stub'
  if (name === 'shotstack') {
    const provider = new ShotstackVideoEditProvider()
    if (!provider.configured) {
      console.warn('[video] VIDEO_EDIT_PROVIDER=shotstack but VIDEO_EDIT_API_KEY missing — stub')
      return new StubVideoEditProvider()
    }
    return provider
  }
  if (name === 'http') {
    const provider = new HttpVideoEditProvider()
    if (!provider.configured) {
      console.warn('[video] VIDEO_EDIT_PROVIDER=http but VIDEO_EDIT_WEBHOOK_URL missing — stub')
      return new StubVideoEditProvider()
    }
    return provider
  }
  if (name === 'test') {
    return new TestVideoEditProvider()
  }
  if (name !== 'stub') {
    console.warn(`[video] Unknown VIDEO_EDIT_PROVIDER="${name}" — using stub`)
  }
  return new StubVideoEditProvider()
}

export function isVideoProviderConfigured(): boolean {
  const p = getVideoEditProvider()
  return p.configured && p.kind !== 'STUB'
}

export function describeVideoProviderConfig(): {
  configured: boolean
  provider: string
  kind: 'REAL' | 'TEST' | 'STUB'
  missing: string[]
  note: string
  stage?: string
  callback_configured?: boolean
} {
  const name = process.env.VIDEO_EDIT_PROVIDER?.trim() || 'stub'
  if (name === 'shotstack') {
    const cfg = describeShotstackConnection()
    return {
      configured: cfg.configured,
      provider: cfg.provider,
      kind: cfg.configured ? 'REAL' : 'STUB',
      missing: cfg.missing,
      note: cfg.note,
      stage: cfg.stage,
      callback_configured: cfg.callback_configured,
    }
  }
  const missing: string[] = []
  if (name === 'http') {
    if (!process.env.VIDEO_EDIT_WEBHOOK_URL?.trim()) missing.push('VIDEO_EDIT_WEBHOOK_URL')
    if (!process.env.VIDEO_EDIT_STATUS_URL?.trim())
      missing.push('VIDEO_EDIT_STATUS_URL (recommended for async)')
  }
  const p = getVideoEditProvider()
  return {
    configured: isVideoProviderConfigured(),
    provider: p.name,
    kind: p.kind,
    missing,
    note:
      p.kind === 'STUB'
        ? 'VIDEO PROVIDER: NOT CONNECTED. Set VIDEO_EDIT_PROVIDER=shotstack and VIDEO_EDIT_API_KEY (or http/test).'
        : p.kind === 'TEST'
          ? 'TEST provider active — deterministic renders for verification only, not production.'
          : 'REAL video provider configured.',
  }
}
