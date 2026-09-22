/**
 * VideoIntelligenceProvider — separate from Shotstack VideoEditProvider.
 * Never invents CV results. Unsupported capabilities return UNSUPPORTED / NOT_CONFIGURED.
 */

import type {
  CapabilityState,
  DetectedSegment,
  MediaMetadata,
  QualityAssessment,
  TranscriptionResult,
  VideoIntelligenceCapabilities,
} from '@/lib/jarvis/video/intelligence/types'
import { aspectFromDims } from '@/lib/jarvis/video/intelligence/types'

export interface VideoIntelligenceProvider {
  name: string
  kind: 'REAL' | 'TEST' | 'STUB'
  configured: boolean
  capabilities(): VideoIntelligenceCapabilities
  extractMetadata(input: {
    sourceId: string
    privateFetchUrl: string
  }): Promise<MediaMetadata>
  extractAudio?(input: {
    sourceId: string
    privateFetchUrl: string
  }): Promise<{ status: CapabilityState; note: string; audio_ref?: string }>
  transcribe(input: {
    sourceId: string
    privateFetchUrl: string
    mimeType?: string
    filename?: string
  }): Promise<TranscriptionResult>
  detectScenes?(input: {
    sourceId: string
    privateFetchUrl: string
    metadata?: MediaMetadata
  }): Promise<{ status: CapabilityState; boundaries: number[]; note: string }>
  detectSilence?(input: {
    sourceId: string
    privateFetchUrl: string
    metadata?: MediaMetadata
  }): Promise<{
    status: CapabilityState
    segments: { start: number; end: number }[]
    note: string
  }>
  detectSpeechSegments?(input: {
    sourceId: string
    transcript?: TranscriptionResult
  }): Promise<{ status: CapabilityState; segments: DetectedSegment[]; note: string }>
  classifySegments?(input: {
    sourceId: string
    segments: DetectedSegment[]
    transcript?: TranscriptionResult
  }): Promise<{ status: CapabilityState; segments: DetectedSegment[]; note: string; cost_usd: number }>
  analyzeQuality?(input: {
    sourceId: string
    metadata: MediaMetadata
    transcript?: TranscriptionResult | null
  }): Promise<QualityAssessment>
}

export function unsupportedCapabilities(
  overrides?: Partial<VideoIntelligenceCapabilities>
): VideoIntelligenceCapabilities {
  return {
    metadata: 'unsupported',
    extract_audio: 'unsupported',
    transcription: 'unsupported',
    word_timestamps: 'unsupported',
    scene_detection: 'unsupported',
    silence_detection: 'unsupported',
    speech_segments: 'unsupported',
    face_detection: 'unsupported',
    visual_semantic: 'unsupported',
    segment_classification: 'unsupported',
    quality_judgment: 'unsupported',
    take_similarity: 'unsupported',
    ...overrides,
  }
}

export class StubVideoIntelligenceProvider implements VideoIntelligenceProvider {
  name = 'stub'
  kind = 'STUB' as const
  configured = false

  capabilities() {
    return unsupportedCapabilities({
      metadata: 'not_configured',
      transcription: 'not_configured',
    })
  }

  async extractMetadata(_input?: {
    sourceId: string
    privateFetchUrl?: string
  }): Promise<MediaMetadata> {
    return {
      duration_sec: null,
      width: null,
      height: null,
      fps: null,
      aspect_ratio: null,
      orientation: null,
      has_audio: null,
      audio_channels: null,
      sample_rate: null,
      video_codec: null,
      audio_codec: null,
      source: 'unavailable',
      available: false,
    }
  }

  async transcribe(): Promise<TranscriptionResult> {
    return {
      status: 'NOT_CONFIGURED',
      provider: 'stub',
      full_text: '',
      segments: [],
      words: [],
      language: null,
      language_confidence: null,
      confidence: null,
      cost_usd: 0,
      error: 'Transcription is not currently configured.',
      error_code: 'PROVIDER_UNSUPPORTED',
    }
  }
}

/**
 * TEST provider — deterministic fixtures for verify scripts.
 * Never used as live production intelligence unless VIDEO_INTELLIGENCE_PROVIDER=test.
 */
export class TestVideoIntelligenceProvider implements VideoIntelligenceProvider {
  name = 'test'
  kind = 'TEST' as const
  configured = true

  capabilities() {
    return unsupportedCapabilities({
      metadata: 'supported',
      transcription: 'supported',
      word_timestamps: 'supported',
      speech_segments: 'supported',
      silence_detection: 'supported',
      scene_detection: 'unsupported',
      face_detection: 'unsupported',
      visual_semantic: 'unsupported',
      segment_classification: 'supported',
      quality_judgment: 'supported',
      take_similarity: 'supported',
    })
  }

  async extractMetadata(input: { sourceId: string }): Promise<MediaMetadata> {
    const seed = input.sourceId.charCodeAt(0) % 3
    const duration = [18, 32, 45][seed]!
    const { aspect_ratio, orientation } = aspectFromDims(1080, 1920)
    return {
      duration_sec: duration,
      width: 1080,
      height: 1920,
      fps: 30,
      aspect_ratio,
      orientation,
      has_audio: true,
      audio_channels: 2,
      sample_rate: 48000,
      video_codec: 'h264',
      audio_codec: 'aac',
      source: 'test',
      available: true,
    }
  }

  async transcribe(input: { sourceId: string }): Promise<TranscriptionResult> {
    const seed = input.sourceId.charCodeAt(0) % 3
    const scripts = [
      {
        text: 'Most people think belly fat is about abs. But the real reason is a calorie deficit. Progressive overload matters for beginners.',
        segments: [
          { start: 0, end: 5, text: 'Most people think belly fat is about abs.' },
          { start: 5, end: 12, text: 'But the real reason is a calorie deficit.' },
          { start: 12, end: 18, text: 'Progressive overload matters for beginners.' },
        ],
      },
      {
        text: "Most people think belly fat is about abs. But the real reason is a calorie deficit. Don't forget protein.",
        segments: [
          { start: 0, end: 6, text: 'Most people think belly fat is about abs.' },
          { start: 6, end: 14, text: 'But the real reason is a calorie deficit.' },
          { start: 14, end: 22, text: "Don't forget protein." },
          { start: 22, end: 28, text: 'Follow for more tips.' },
        ],
      },
      {
        text: 'Here is how to set up a squat. Keep your chest up. Drive through your heels. That is the demonstration.',
        segments: [
          { start: 0, end: 8, text: 'Here is how to set up a squat.' },
          { start: 8, end: 20, text: 'Keep your chest up. Drive through your heels.' },
          { start: 20, end: 30, text: 'That is the demonstration.' },
          { start: 30, end: 40, text: 'Save this if you are a beginner.' },
        ],
      },
    ]
    const pick = scripts[seed]!
    return {
      status: 'COMPLETED',
      provider: 'test',
      full_text: pick.text,
      segments: pick.segments,
      words: pick.segments.flatMap((s) =>
        s.text.split(/\s+/).map((word, i) => ({
          start: s.start + i * 0.3,
          end: s.start + i * 0.3 + 0.25,
          word,
        }))
      ),
      language: 'en',
      language_confidence: 0.95,
      confidence: 'high',
      cost_usd: 0,
    }
  }

  async detectSilence() {
    return {
      status: 'supported' as const,
      segments: [{ start: 18, end: 20 }],
      note: 'TEST silence fixture',
    }
  }

  async detectSpeechSegments(input: {
    transcript?: TranscriptionResult
  }) {
    const segs =
      input.transcript?.segments.map((s) => ({
        start_time: s.start,
        end_time: s.end,
        segment_type: 'SPEECH' as const,
        transcript_excerpt: s.text,
        confidence: 'high' as const,
        evidence: [`transcript:${s.start}-${s.end}`],
      })) ?? []
    return { status: 'supported' as const, segments: segs, note: 'TEST speech from transcript' }
  }

  async classifySegments(input: { segments: DetectedSegment[] }) {
    const classified = input.segments.map((s, i) => {
      const text = (s.transcript_excerpt || '').toLowerCase()
      let label: DetectedSegment['classification_label'] = 'EXPLANATION'
      let type: DetectedSegment['segment_type'] = 'EXPLANATION'
      if (i === 0 || /most people|mistake|wrong/.test(text)) {
        label = 'HOOK'
        type = 'HOOK'
      } else if (/follow|save this|comment/.test(text)) {
        label = 'CTA'
        type = 'CTA'
      } else if (/demonstration|squat|how to/.test(text)) {
        label = 'DEMONSTRATION'
        type = 'DEMONSTRATION'
      } else if (/protein|calorie|progressive/.test(text)) {
        label = 'EDUCATION'
        type = 'EXPLANATION'
      }
      return {
        ...s,
        segment_type: type,
        classification_label: label,
        evidence: [...s.evidence, `test_classifier:${label}`],
      }
    })
    return {
      status: 'supported' as const,
      segments: classified,
      note: 'TEST classifier',
      cost_usd: 0,
    }
  }

  async analyzeQuality(input: { metadata: MediaMetadata }): Promise<QualityAssessment> {
    return {
      deterministic: {
        resolution:
          input.metadata.width && input.metadata.height
            ? `${input.metadata.width}×${input.metadata.height}`
            : null,
        fps: input.metadata.fps,
        has_audio: input.metadata.has_audio,
        duration_sec: input.metadata.duration_sec,
        orientation: input.metadata.orientation,
      },
      judgment: {
        audio_clarity: 'GOOD',
        framing: 'GOOD',
        lighting: 'FAIR',
        sharpness: 'GOOD',
        speech_clarity: 'GOOD',
        background_noise: 'LOW',
        overall_suitability: 'HIGH',
        notes: ['TEST quality judgment — not a live model assessment'],
      },
      judgment_available: true,
      judgment_source: 'heuristic',
    }
  }
}

/** Shotstack probe → deterministic metadata only. No CV inventing. */
export class ShotstackMetadataIntelligenceProvider implements VideoIntelligenceProvider {
  name = 'shotstack_metadata'
  kind = 'REAL' as const
  configured: boolean
  private inner: VideoIntelligenceProvider

  constructor(transcriptionFallback?: VideoIntelligenceProvider) {
    const key = process.env.VIDEO_EDIT_API_KEY?.trim() || process.env.SHOTSTACK_API_KEY?.trim()
    this.configured = Boolean(key)
    this.inner = transcriptionFallback ?? new StubVideoIntelligenceProvider()
  }

  capabilities() {
    const base = this.inner.capabilities()
    return {
      ...base,
      metadata: this.configured ? ('supported' as const) : ('not_configured' as const),
      scene_detection: 'unsupported' as const,
      silence_detection: 'unsupported' as const,
      face_detection: 'unsupported' as const,
      visual_semantic: 'unsupported' as const,
    }
  }

  async extractMetadata(input: {
    sourceId: string
    privateFetchUrl: string
  }): Promise<MediaMetadata> {
    if (!this.configured) {
      return new StubVideoIntelligenceProvider().extractMetadata(input)
    }
    try {
      const { shotstackProbe } = await import('@/lib/jarvis/video/shotstack/client')
      const probe = await shotstackProbe(input.privateFetchUrl)
      if (!probe.ok || !probe.data) {
        return {
          ...(await new StubVideoIntelligenceProvider().extractMetadata(input)),
          available: false,
          source: 'unavailable',
        }
      }
      const meta = probe.data.response?.metadata
      const streams = (meta?.streams || []) as {
        codec_type?: string
        width?: number
        height?: number
        avg_frame_rate?: string
        r_frame_rate?: string
        codec_name?: string
        channels?: number
        sample_rate?: string | number
        duration?: string | number
      }[]
      const format = (meta?.format || {}) as {
        duration?: string | number
      }
      const video = streams.find((s) => s.codec_type === 'video')
      const audio = streams.find((s) => s.codec_type === 'audio')
      const durationRaw = format.duration ?? video?.duration
      const duration_sec =
        durationRaw != null && !Number.isNaN(Number(durationRaw)) ? Number(durationRaw) : null
      let fps: number | null = null
      const rate = video?.avg_frame_rate || video?.r_frame_rate
      if (rate && rate.includes('/')) {
        const [a, b] = rate.split('/').map(Number)
        if (a && b) fps = a / b
      }
      const width = video?.width ?? null
      const height = video?.height ?? null
      const { aspect_ratio, orientation } = aspectFromDims(width, height)
      return {
        duration_sec: Number.isFinite(duration_sec as number) ? duration_sec : null,
        width,
        height,
        fps,
        aspect_ratio,
        orientation,
        has_audio: Boolean(audio),
        audio_channels: audio?.channels ?? null,
        sample_rate: audio?.sample_rate != null ? Number(audio.sample_rate) : null,
        video_codec: video?.codec_name ?? null,
        audio_codec: audio?.codec_name ?? null,
        source: 'shotstack_probe',
        available: true,
      }
    } catch (err) {
      return {
        ...(await new StubVideoIntelligenceProvider().extractMetadata(input)),
        available: false,
        source: 'unavailable',
      }
    }
  }

  async transcribe(input: {
    sourceId: string
    privateFetchUrl: string
    mimeType?: string
    filename?: string
  }) {
    return this.inner.transcribe(input)
  }

  async detectSpeechSegments(input: {
    sourceId: string
    transcript?: TranscriptionResult
  }) {
    if (this.inner.detectSpeechSegments) return this.inner.detectSpeechSegments(input)
    if (input.transcript?.status === 'COMPLETED' && input.transcript.segments.length) {
      return {
        status: 'supported' as const,
        segments: input.transcript.segments.map((s) => ({
          start_time: s.start,
          end_time: s.end,
          segment_type: 'SPEECH' as const,
          transcript_excerpt: s.text,
          confidence: 'medium' as const,
          evidence: [`transcript_segment:${s.start}-${s.end}`],
        })),
        note: 'Speech segments derived from transcript timestamps only',
      }
    }
    return {
      status: 'unsupported' as const,
      segments: [],
      note: 'Speech segment detection requires a completed transcript',
    }
  }

  async classifySegments(input: {
    sourceId: string
    segments: DetectedSegment[]
    transcript?: TranscriptionResult
  }) {
    if (this.inner.classifySegments) return this.inner.classifySegments(input)
    return {
      status: 'unsupported' as const,
      segments: input.segments,
      note: 'Segment classification provider not configured',
      cost_usd: 0,
    }
  }

  async analyzeQuality(input: {
    sourceId: string
    metadata: MediaMetadata
    transcript?: TranscriptionResult | null
  }) {
    if (this.inner.analyzeQuality) return this.inner.analyzeQuality(input)
    return {
      deterministic: {
        resolution:
          input.metadata.width && input.metadata.height
            ? `${input.metadata.width}×${input.metadata.height}`
            : null,
        fps: input.metadata.fps,
        has_audio: input.metadata.has_audio,
        duration_sec: input.metadata.duration_sec,
        orientation: input.metadata.orientation,
      },
      judgment: {},
      judgment_available: false,
      judgment_source: 'none' as const,
    }
  }
}

/** OpenAI Whisper transcription when enabled. */
export class OpenAITranscriptionProvider implements VideoIntelligenceProvider {
  name = 'openai_whisper'
  kind = 'REAL' as const
  configured: boolean
  private metadataProvider: VideoIntelligenceProvider

  constructor(metadataProvider?: VideoIntelligenceProvider) {
    this.configured = Boolean(process.env.OPENAI_API_KEY?.trim()) &&
      (process.env.VIDEO_INTELLIGENCE_TRANSCRIPTION?.trim() || 'off') === 'openai'
    this.metadataProvider = metadataProvider ?? new StubVideoIntelligenceProvider()
  }

  capabilities() {
    return {
      ...this.metadataProvider.capabilities(),
      transcription: this.configured ? ('supported' as const) : ('not_configured' as const),
      word_timestamps: this.configured ? ('supported' as const) : ('not_configured' as const),
      speech_segments: this.configured ? ('supported' as const) : ('unsupported' as const),
      segment_classification: process.env.OPENAI_API_KEY?.trim()
        ? ('supported' as const)
        : ('not_configured' as const),
      quality_judgment: 'unsupported' as const,
    }
  }

  async extractMetadata(input: { sourceId: string; privateFetchUrl: string }) {
    return this.metadataProvider.extractMetadata(input)
  }

  async transcribe(input: {
    sourceId: string
    privateFetchUrl: string
    mimeType?: string
    filename?: string
  }): Promise<TranscriptionResult> {
    if (!this.configured) {
      return {
        status: 'NOT_CONFIGURED',
        provider: this.name,
        full_text: '',
        segments: [],
        words: [],
        language: null,
        language_confidence: null,
        confidence: null,
        cost_usd: 0,
        error: 'Transcription is not currently configured. Set VIDEO_INTELLIGENCE_TRANSCRIPTION=openai and OPENAI_API_KEY.',
        error_code: 'PROVIDER_UNSUPPORTED',
      }
    }
    try {
      const OpenAI = (await import('openai')).default
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() })
      const res = await fetch(input.privateFetchUrl)
      if (!res.ok) {
        return {
          status: 'FAILED',
          provider: this.name,
          full_text: '',
          segments: [],
          words: [],
          language: null,
          language_confidence: null,
          confidence: null,
          cost_usd: 0,
          error: `Failed to fetch source for transcription (${res.status})`,
          error_code: 'STORAGE_ERROR',
        }
      }
      const buf = Buffer.from(await res.arrayBuffer())
      const file = new File(
        [buf],
        input.filename || `${input.sourceId}.mp4`,
        { type: input.mimeType || 'video/mp4' }
      )
      const result = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment', 'word'],
      })
      const full_text = (result as { text?: string }).text || ''
      const segs = ((result as { segments?: { start: number; end: number; text: string }[] }).segments ||
        []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      }))
      const words = ((result as { words?: { start: number; end: number; word: string }[] }).words ||
        []).map((w) => ({
        start: w.start,
        end: w.end,
        word: w.word,
      }))
      const language = (result as { language?: string }).language ?? null
      // Rough cost estimate — Whisper is ~$0.006/min; we bill via governor separately
      const minutes = Math.max(0.1, (segs.at(-1)?.end ?? 60) / 60)
      return {
        status: 'COMPLETED',
        provider: this.name,
        full_text,
        segments: segs,
        words,
        language,
        language_confidence: language ? 0.8 : null,
        confidence: full_text.length > 40 ? 'medium' : 'low',
        cost_usd: Number((minutes * 0.006).toFixed(4)),
      }
    } catch (err) {
      return {
        status: 'FAILED',
        provider: this.name,
        full_text: '',
        segments: [],
        words: [],
        language: null,
        language_confidence: null,
        confidence: null,
        cost_usd: 0,
        error: err instanceof Error ? err.message : 'Transcription failed',
        error_code: 'TRANSCRIPTION_FAILED',
      }
    }
  }

  async detectSpeechSegments(input: {
    sourceId: string
    transcript?: TranscriptionResult
  }) {
    if (input.transcript?.status !== 'COMPLETED') {
      return {
        status: 'unsupported' as const,
        segments: [],
        note: 'Requires completed transcript',
      }
    }
    return {
      status: 'supported' as const,
      segments: input.transcript.segments.map((s) => ({
        start_time: s.start,
        end_time: s.end,
        segment_type: 'SPEECH' as const,
        transcript_excerpt: s.text,
        confidence: 'medium' as const,
        evidence: [`whisper_segment:${s.start}-${s.end}`],
      })),
      note: 'Derived from Whisper segment timestamps',
    }
  }

  async classifySegments(input: {
    sourceId: string
    segments: DetectedSegment[]
    transcript?: TranscriptionResult
  }) {
    // Prefer cheap heuristic first; LLM optional upgrade
    const heuristic = classifyByHeuristic(input.segments)
    if (!process.env.OPENAI_API_KEY?.trim() || process.env.VIDEO_INTELLIGENCE_LLM_CLASSIFY !== 'true') {
      return {
        status: 'supported' as const,
        segments: heuristic,
        note: 'Heuristic classification from transcript keywords (LLM classify off)',
        cost_usd: 0,
      }
    }
    try {
      const { generateMarketingJson } = await import('@/lib/ai-marketing/openai/marketing-openai')
      const { z } = await import('zod')
      const schema = z.object({
        items: z.array(
          z.object({
            index: z.number().int(),
            label: z.string(),
            confidence: z.enum(['low', 'medium', 'high']),
          })
        ),
      })
      const { data } = await generateMarketingJson({
        systemPrompt:
          'Classify video transcript segments for fitness short-form content. Labels: HOOK, EDUCATION, TIP, STORY, CTA, DEMONSTRATION, EXPLANATION, INTRO, OUTRO, FILLER, UNUSABLE. Return JSON only. Do not invent content not in the transcript.',
        userPrompt: JSON.stringify(
          input.segments.map((s, index) => ({
            index,
            start: s.start_time,
            end: s.end_time,
            text: s.transcript_excerpt,
          }))
        ),
        schema,
        maxTokens: 1200,
      })
      const segments = input.segments.map((s, index) => {
        const hit = data.items.find((i) => i.index === index)
        const label = (hit?.label || heuristic[index]?.classification_label || 'EXPLANATION') as DetectedSegment['classification_label']
        return {
          ...s,
          classification_label: label,
          segment_type: mapLabelToType(label),
          confidence: hit?.confidence || 'low',
          evidence: [...s.evidence, `llm_classify:${label}`],
        }
      })
      return {
        status: 'supported' as const,
        segments,
        note: 'LLM classification with transcript evidence',
        cost_usd: 0.02,
      }
    } catch {
      return {
        status: 'supported' as const,
        segments: heuristic,
        note: 'Fell back to heuristic after LLM classify failure',
        cost_usd: 0,
      }
    }
  }
}

function mapLabelToType(label: DetectedSegment['classification_label']): DetectedSegment['segment_type'] {
  switch (label) {
    case 'HOOK':
      return 'HOOK'
    case 'CTA':
      return 'CTA'
    case 'DEMONSTRATION':
      return 'DEMONSTRATION'
    case 'STORY':
      return 'STORY'
    case 'INTRO':
      return 'INTRO'
    case 'OUTRO':
      return 'OUTRO'
    case 'FILLER':
    case 'UNUSABLE':
      return 'FILLER'
    case 'BROLL':
      return 'B_ROLL'
    default:
      return 'EXPLANATION'
  }
}

export function classifyByHeuristic(segments: DetectedSegment[]): DetectedSegment[] {
  return segments.map((s, i) => {
    const text = (s.transcript_excerpt || '').toLowerCase()
    let label: DetectedSegment['classification_label'] = 'EXPLANATION'
    if (i === 0 || /most people|mistake|wrong|secret|stop doing/.test(text)) label = 'HOOK'
    else if (/follow|save this|comment|link in|dm me/.test(text)) label = 'CTA'
    else if (/here'?s how|demonstration|form check|set up/.test(text)) label = 'DEMONSTRATION'
    else if (/story|i used to|when i/.test(text)) label = 'STORY'
    else if (/protein|calorie|deficit|progressive|belly fat|tip/.test(text)) label = 'EDUCATION'
    else if (/um+|uh+|so yeah/.test(text) && text.length < 20) label = 'FILLER'
    return {
      ...s,
      classification_label: label,
      segment_type: mapLabelToType(label),
      confidence: 'low' as const,
      evidence: [...s.evidence, `heuristic:${label}`],
    }
  })
}

export function getVideoIntelligenceProvider(): VideoIntelligenceProvider {
  const name = process.env.VIDEO_INTELLIGENCE_PROVIDER?.trim() || 'auto'
  if (name === 'test') return new TestVideoIntelligenceProvider()
  if (name === 'stub') return new StubVideoIntelligenceProvider()

  const shotstackKey =
    process.env.VIDEO_EDIT_API_KEY?.trim() || process.env.SHOTSTACK_API_KEY?.trim()
  const whisperOn =
    Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    (process.env.VIDEO_INTELLIGENCE_TRANSCRIPTION?.trim() || 'off') === 'openai'

  if (name === 'openai' || (name === 'auto' && whisperOn)) {
    const meta = shotstackKey
      ? new ShotstackMetadataIntelligenceProvider(new StubVideoIntelligenceProvider())
      : new StubVideoIntelligenceProvider()
    // Compose: OpenAI for transcript/classify, Shotstack for metadata when available
    const openai = new OpenAITranscriptionProvider(meta)
    if (shotstackKey) {
      return new ShotstackMetadataIntelligenceProvider(openai)
    }
    return openai
  }

  if (name === 'shotstack' || (name === 'auto' && shotstackKey)) {
    const transcriptInner = whisperOn
      ? new OpenAITranscriptionProvider(new StubVideoIntelligenceProvider())
      : new StubVideoIntelligenceProvider()
    return new ShotstackMetadataIntelligenceProvider(transcriptInner)
  }

  return new StubVideoIntelligenceProvider()
}

export function describeVideoIntelligenceConfig(): {
  configured: boolean
  provider: string
  kind: 'REAL' | 'TEST' | 'STUB'
  capabilities: VideoIntelligenceCapabilities
  missing: string[]
  note: string
} {
  const p = getVideoIntelligenceProvider()
  const caps = p.capabilities()
  const missing: string[] = []
  if (caps.metadata === 'not_configured') {
    missing.push('VIDEO_EDIT_API_KEY (Shotstack probe for metadata)')
  }
  if (caps.transcription === 'not_configured') {
    missing.push('VIDEO_INTELLIGENCE_TRANSCRIPTION=openai + OPENAI_API_KEY')
  }
  const anyReal =
    caps.metadata === 'supported' ||
    caps.transcription === 'supported' ||
    caps.segment_classification === 'supported'
  return {
    configured: p.configured && p.kind !== 'STUB',
    provider: p.name,
    kind: p.kind,
    capabilities: caps,
    missing,
    note:
      p.kind === 'STUB'
        ? 'VIDEO INTELLIGENCE: NOT CONFIGURED. Metadata needs Shotstack probe; transcription needs VIDEO_INTELLIGENCE_TRANSCRIPTION=openai.'
        : p.kind === 'TEST'
          ? 'TEST video intelligence active — fixtures only, not live analysis.'
          : anyReal
            ? `Video intelligence provider "${p.name}" active. Unsupported CV capabilities remain unsupported.`
            : 'Provider selected but no intelligence capabilities are supported yet.',
  }
}
