/**
 * Phase 6 — Canonical Edit Decision List (provider-agnostic).
 * Shotstack JSON is NEVER stored as the source of truth.
 */

export type EdlStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'READY_TO_RENDER'
  | 'PAUSED_BUDGET'
  | 'RENDERING'
  | 'RENDERED'
  | 'REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED'
  | 'ARCHIVED'
  | 'MISSING_FOOTAGE'

export type ClipPurpose =
  | 'HOOK'
  | 'BODY'
  | 'BROLL'
  | 'PROOF'
  | 'TRANSITION'
  | 'CTA'
  | 'OUTRO'
  | 'OTHER'

export type CaptionProvenance =
  | 'TRANSCRIPT_DERIVED'
  | 'SCRIPT_DERIVED'
  | 'USER_PROVIDED'
  | 'AI_SUGGESTED'

export type OverlayKind = 'HOOK_TEXT' | 'EMPHASIS_TEXT' | 'CTA_TEXT' | 'LABEL' | 'SUBTITLE'

export type TransitionKind = 'CUT' | 'FADE' | 'CROSSFADE'

export type CapabilityFlag = 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_CONFIGURED'

export type TimelineClip = {
  id: string
  source_ref: string | null
  source_id: string | null
  source_start_ms: number
  source_end_ms: number
  timeline_start_ms: number
  timeline_end_ms: number
  trim: { start_ms: number; end_ms: number } | null
  crop: { strategy: 'center_crop' | 'none'; note: string }
  scale: number
  position: 'center'
  volume: number
  playback_rate: number
  transition_in: TransitionKind
  transition_out: TransitionKind
  purpose: ClipPurpose
  provenance: string
  missing?: boolean
  missing_reason?: string
}

export type CaptionCue = {
  id: string
  text: string
  start_ms: number
  end_ms: number
  provenance: CaptionProvenance
  style_preset: string
}

export type TextOverlay = {
  id: string
  kind: OverlayKind
  text: string
  start_ms: number
  end_ms: number
  position: 'top' | 'center' | 'bottom'
  style_preset: string
  provenance: string
}

export type EdlAudio = {
  source_volume: number
  mute: boolean
  fade_in_ms: number
  fade_out_ms: number
  music_track_ref: string | null
  music_note: string
}

export type EdlOutput = {
  width: number
  height: number
  aspect_ratio: '9:16' | '1:1' | '16:9'
  fps: number
  format: 'mp4'
  codec: 'h264'
}

export type SourceManifestEntry = {
  source_id: string
  source_ref: string
  filename: string | null
  duration_ms: number | null
}

export type EditDecisionList = {
  id: string | null
  creative_content_id: string | null
  creative_version: number | null
  session_id: string | null
  version: number
  parent_edl_id: string | null
  title: string
  objective: string | null
  platform: string
  format: string
  aspect_ratio: '9:16' | '1:1' | '16:9'
  target_duration_ms: number | null
  timeline: TimelineClip[]
  audio: EdlAudio
  captions: CaptionCue[]
  overlays: TextOverlay[]
  transitions: TransitionKind[]
  output: EdlOutput
  source_manifest: SourceManifestEntry[]
  warnings: string[]
  unsupported_features: Array<{ feature: string; status: CapabilityFlag; note: string }>
  estimated_render_cost_usd: number | null
  estimated_duration_ms: number
  status: EdlStatus
  fingerprint: string | null
  revision_reason: string | null
  user_feedback: string | null
  changed_operations: string[]
  /** Never include Shotstack-specific payload here */
  provider_agnostic: true
}

export type EdlValidationResult = {
  ok: boolean
  status: 'READY' | 'NEEDS_REVISION' | 'MISSING_FOOTAGE' | 'UNSUPPORTED'
  errors: string[]
  warnings: string[]
}

export type EdlDiffOp = {
  kind: 'removed' | 'changed' | 'replaced' | 'added' | 'unchanged'
  path: string
  before?: unknown
  after?: unknown
  summary: string
}

export type EdlDiff = {
  from_version: number
  to_version: number
  ops: EdlDiffOp[]
  preserved_count: number
  changed_count: number
}

export const SHORT_FORM_FITNESS_REEL_OUTPUT: EdlOutput = {
  width: 1080,
  height: 1920,
  aspect_ratio: '9:16',
  fps: 30,
  format: 'mp4',
  codec: 'h264',
}

export const TARGET_DURATIONS_SEC = [15, 20, 30, 45, 60, 90] as const

export function ms(sec: number): number {
  return Math.round(sec * 1000)
}

export function sec(msVal: number): number {
  return Number((msVal / 1000).toFixed(3))
}

export function purposeFromRole(role: string): ClipPurpose {
  const r = role.toUpperCase()
  if (r.includes('HOOK') || r === 'QUESTION') return 'HOOK'
  if (r.includes('CTA')) return 'CTA'
  if (r.includes('OUTRO')) return 'OUTRO'
  if (r.includes('BROLL') || r.includes('B_ROLL')) return 'BROLL'
  if (r.includes('PROOF') || r.includes('DEMONSTRATION')) return 'PROOF'
  if (r.includes('TRANSITION')) return 'TRANSITION'
  return 'BODY'
}
