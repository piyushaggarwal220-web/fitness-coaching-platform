/**
 * Real video edit provider architecture for Jarvis.
 * Stub never claims a successful render. HTTP provider delegates to an external service.
 */

export type VideoJobStatus =
  | 'queued'
  | 'analyzing'
  | 'editing'
  | 'rendering'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'review_required'
  | 'awaiting_approval'

export type VideoAnalysis = {
  duration_sec?: number | null
  has_audio?: boolean | null
  moments?: { start_sec: number; end_sec: number; label: string; score?: number }[]
  notes?: string
  available: boolean
}

export type VideoEditPlan = {
  target_aspect: '9:16' | '1:1' | '16:9'
  captions: boolean
  remove_silence: boolean
  hooks: string[]
  clips: { start_sec: number; end_sec: number; purpose: string }[]
  notes?: string
}

export type VideoRenderResult = {
  status: VideoJobStatus
  output_video?: string | null
  output_variants?: { url: string; label: string; aspect?: string }[]
  transcript?: string | null
  analysis?: VideoAnalysis
  edit_plan?: VideoEditPlan
  provider_job_id?: string | null
  error?: string | null
  available: boolean
}

export interface VideoEditProvider {
  name: string
  configured: boolean
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
  }): Promise<{ ok: boolean; note: string }>
  createCuts(input: {
    jobId: string
    plan: VideoEditPlan
  }): Promise<{ ok: boolean; note: string }>
  generateSubtitles(input: {
    jobId: string
    sourceVideo: string
  }): Promise<{ transcript?: string; srt?: string; note: string }>
  reframeVertical(input: {
    jobId: string
    sourceVideo: string
  }): Promise<{ ok: boolean; note: string }>
  render(input: {
    jobId: string
    sourceVideo: string
    plan: VideoEditPlan
  }): Promise<VideoRenderResult>
  getStatus(providerJobId: string): Promise<{ status: VideoJobStatus; error?: string }>
  getResult(providerJobId: string): Promise<VideoRenderResult>
  /** Full pipeline convenience used by job runner */
  process(job: {
    id: string
    source_video: string
    edit_instructions: Record<string, unknown>
  }): Promise<VideoRenderResult>
}

export class StubVideoEditProvider implements VideoEditProvider {
  name = 'stub'
  configured = false

  async analyzeVideo() {
    return {
      available: false,
      notes: 'Video editing provider is not configured.',
      moments: [],
    }
  }

  async detectSegments() {
    return []
  }

  async removeSilence() {
    return { ok: false, note: 'Video editing provider is not configured.' }
  }

  async createCuts() {
    return { ok: false, note: 'Video editing provider is not configured.' }
  }

  async generateSubtitles() {
    return { note: 'Video editing provider is not configured.' }
  }

  async reframeVertical() {
    return { ok: false, note: 'Video editing provider is not configured.' }
  }

  async render(): Promise<VideoRenderResult> {
    return {
      status: 'failed',
      available: false,
      error: 'Video editing provider is not configured.',
      output_video: null,
      output_variants: [],
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
      error: 'Video editing provider is not configured.',
      analysis: {
        available: false,
        notes: 'Set VIDEO_EDIT_PROVIDER=http and VIDEO_EDIT_WEBHOOK_URL to enable real processing.',
      },
      edit_plan: {
        target_aspect: '9:16',
        captions: true,
        remove_silence: true,
        hooks: [],
        clips: [],
        notes: 'No provider — edit plan not executed.',
      },
      output_video: null,
      output_variants: [],
      transcript: null,
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
      return { available: false, notes: 'VIDEO_EDIT_WEBHOOK_URL missing' }
    }
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ action: 'analyze', job_id: input.jobId, source_video: input.sourceVideo }),
    })
    if (!res.ok) {
      return { available: false, notes: `Analyze failed (${res.status})` }
    }
    const json = (await res.json()) as VideoAnalysis
    return { ...json, available: true }
  }

  async detectSegments(input: {
    jobId: string
    sourceVideo: string
    analysis?: VideoAnalysis
  }) {
    return input.analysis?.moments?.map((m) => ({
      start_sec: m.start_sec,
      end_sec: m.end_sec,
      purpose: m.label,
    })) ?? []
  }

  async removeSilence() {
    return { ok: true, note: 'Delegated to provider pipeline' }
  }

  async createCuts() {
    return { ok: true, note: 'Delegated to provider pipeline' }
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
    if (!res.ok) return { note: `Subtitles failed (${res.status})` }
    return (await res.json()) as { transcript?: string; srt?: string; note: string }
  }

  async reframeVertical() {
    return { ok: true, note: 'Delegated to provider pipeline' }
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
      }),
    })
    if (!res.ok) {
      return {
        status: 'failed',
        available: false,
        error: `Render request failed (${res.status})`,
      }
    }
    const json = (await res.json()) as VideoRenderResult
    if (!json.output_video && json.status === 'completed') {
      // Never accept completed without output
      return {
        ...json,
        status: 'failed',
        available: false,
        error: 'Provider claimed completed without output_video',
      }
    }
    return { ...json, available: true }
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
        error: status.error,
        output_video: null,
      }
    }
    if (!this.statusUrl) {
      return {
        status: 'failed',
        available: false,
        error: 'VIDEO_EDIT_STATUS_URL required to fetch results',
      }
    }
    const url = `${this.statusUrl.replace(/\/$/, '')}/${encodeURIComponent(providerJobId)}/result`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) {
      return { status: 'failed', available: false, error: `Result ${res.status}` }
    }
    const json = (await res.json()) as VideoRenderResult
    if (!json.output_video) {
      return {
        status: 'failed',
        available: false,
        error: 'Provider result missing output_video',
      }
    }
    return { ...json, available: true, status: 'completed' }
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
    const plan: VideoEditPlan = {
      target_aspect: '9:16',
      captions: true,
      remove_silence: true,
      hooks: Array.isArray(job.edit_instructions.hooks)
        ? (job.edit_instructions.hooks as string[])
        : [],
      clips,
      notes: 'Generated by HttpVideoEditProvider',
    }
    const subs = await this.generateSubtitles({
      jobId: job.id,
      sourceVideo: job.source_video,
    })
    const rendered = await this.render({
      jobId: job.id,
      sourceVideo: job.source_video,
      plan,
    })
    return {
      ...rendered,
      analysis,
      edit_plan: plan,
      transcript: subs.transcript ?? rendered.transcript ?? null,
    }
  }
}

export function getVideoEditProvider(): VideoEditProvider {
  const name = process.env.VIDEO_EDIT_PROVIDER?.trim() || 'stub'
  if (name === 'http') {
    const provider = new HttpVideoEditProvider()
    if (!provider.configured) {
      console.warn('[video] VIDEO_EDIT_PROVIDER=http but VIDEO_EDIT_WEBHOOK_URL missing — stub')
      return new StubVideoEditProvider()
    }
    return provider
  }
  if (name !== 'stub') {
    console.warn(`[video] Unknown VIDEO_EDIT_PROVIDER="${name}" — using stub`)
  }
  return new StubVideoEditProvider()
}

export function isVideoProviderConfigured(): boolean {
  const p = getVideoEditProvider()
  return p.configured && p.name !== 'stub'
}
