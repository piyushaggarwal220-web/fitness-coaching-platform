/**
 * Phase 4 Video Intelligence types.
 * Separate from VideoEditProvider (Shotstack render path).
 */

export type CapabilityState = 'supported' | 'unsupported' | 'unavailable' | 'not_configured'

export type PipelineStage =
  | 'VALIDATE'
  | 'METADATA'
  | 'AUDIO'
  | 'TRANSCRIPTION'
  | 'SEGMENTS'
  | 'CLASSIFICATION'
  | 'QUALITY'
  | 'INDEX'
  | 'OPPORTUNITIES'

export type PipelineStageStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'UNSUPPORTED'
  | 'CANCELLED'
  | 'PAUSED_BUDGET'

export type VideoIntelErrorCode =
  | 'INVALID_FILE'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_UNSUPPORTED'
  | 'TRANSCRIPTION_FAILED'
  | 'ANALYSIS_FAILED'
  | 'BUDGET_EXHAUSTED'
  | 'SOURCE_NOT_FOUND'
  | 'STORAGE_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'

export type ConfidenceLevel = 'low' | 'medium' | 'high'

export type SegmentType =
  | 'SPEECH'
  | 'SILENCE'
  | 'HOOK'
  | 'EXPLANATION'
  | 'CTA'
  | 'STORY'
  | 'DEMONSTRATION'
  | 'B_ROLL'
  | 'TRANSITION'
  | 'REACTION'
  | 'INTRO'
  | 'OUTRO'
  | 'FILLER'
  | 'UNKNOWN'

export type ClassificationLabel =
  | 'HOOK'
  | 'EDUCATION'
  | 'MYTH'
  | 'TIP'
  | 'STORY'
  | 'PERSONAL_EXPERIENCE'
  | 'TRANSFORMATION'
  | 'OBJECTION'
  | 'CTA'
  | 'DEMONSTRATION'
  | 'EXPLANATION'
  | 'BROLL'
  | 'TESTIMONIAL'
  | 'QUESTION'
  | 'ANSWER'
  | 'INTRO'
  | 'OUTRO'
  | 'FILLER'
  | 'UNUSABLE'

export type MediaMetadata = {
  duration_sec: number | null
  width: number | null
  height: number | null
  fps: number | null
  aspect_ratio: string | null
  orientation: 'portrait' | 'landscape' | 'square' | null
  has_audio: boolean | null
  audio_channels: number | null
  sample_rate: number | null
  video_codec: string | null
  audio_codec: string | null
  source: 'shotstack_probe' | 'ffprobe' | 'test' | 'unavailable'
  available: boolean
}

export type TranscriptSegment = {
  start: number
  end: number
  text: string
  confidence?: number
}

export type TranscriptWord = {
  start: number
  end: number
  word: string
  confidence?: number
}

export type TranscriptionResult = {
  status: 'COMPLETED' | 'FAILED' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'NOT_CONFIGURED'
  provider: string
  full_text: string
  segments: TranscriptSegment[]
  words: TranscriptWord[]
  language: string | null
  language_confidence: number | null
  confidence: ConfidenceLevel | null
  cost_usd: number
  error?: string
  error_code?: VideoIntelErrorCode
}

export type DetectedSegment = {
  start_time: number
  end_time: number
  segment_type: SegmentType
  classification_label?: ClassificationLabel | null
  transcript_excerpt?: string | null
  confidence: ConfidenceLevel
  evidence: string[]
  metadata?: Record<string, unknown>
}

export type QualityAssessment = {
  deterministic: {
    resolution: string | null
    fps: number | null
    has_audio: boolean | null
    duration_sec: number | null
    orientation: string | null
  }
  judgment: {
    audio_clarity?: string
    framing?: string
    lighting?: string
    sharpness?: string
    speech_clarity?: string
    background_noise?: string
    overall_suitability?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
    notes?: string[]
  }
  judgment_available: boolean
  judgment_source: 'model' | 'heuristic' | 'none'
}

export type SourceMapping = {
  source_id: string
  start: number
  end: number
  role?: string
}

export type ContentOpportunity = {
  title: string
  concept: string
  hook: string | null
  audience: string | null
  objective: string | null
  estimated_duration_sec: number | null
  source_segments: SourceMapping[]
  missing_material: string[]
  confidence: ConfidenceLevel
  evidence: string[]
  dedupe_key: string
}

export type VideoIntelligenceCapabilities = {
  metadata: CapabilityState
  extract_audio: CapabilityState
  transcription: CapabilityState
  word_timestamps: CapabilityState
  scene_detection: CapabilityState
  silence_detection: CapabilityState
  speech_segments: CapabilityState
  face_detection: CapabilityState
  visual_semantic: CapabilityState
  segment_classification: CapabilityState
  quality_judgment: CapabilityState
  take_similarity: CapabilityState
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'VALIDATE',
  'METADATA',
  'AUDIO',
  'TRANSCRIPTION',
  'SEGMENTS',
  'CLASSIFICATION',
  'QUALITY',
  'INDEX',
  'OPPORTUNITIES',
]

export function aspectFromDims(w: number | null, h: number | null): {
  aspect_ratio: string | null
  orientation: 'portrait' | 'landscape' | 'square' | null
} {
  if (!w || !h || w <= 0 || h <= 0) return { aspect_ratio: null, orientation: null }
  const g = gcd(w, h)
  const aspect_ratio = `${w / g}:${h / g}`
  const orientation =
    w === h ? 'square' : w > h ? 'landscape' : 'portrait'
  return { aspect_ratio, orientation }
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}
