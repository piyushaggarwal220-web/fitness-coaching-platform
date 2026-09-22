/**
 * Deterministic Shotstack Edit JSON builder.
 * Never executes shell/ffmpeg. Maps Jarvis plans → Shotstack timeline/output.
 */

import type { VideoEditPlan } from '@/lib/jarvis/video/provider'
import {
  SHORT_FORM_FITNESS_REEL_PRESET,
  type VideoVariantKind,
} from '@/lib/jarvis/video/presets'

export type ShotstackEditJson = {
  timeline: {
    background: string
    tracks: Array<{
      clips: Array<Record<string, unknown>>
    }>
  }
  output: {
    format: 'mp4'
    size: { width: number; height: number }
    fps: number
    quality?: string
  }
  callback?: string
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function outputSize(aspect: VideoEditPlan['target_aspect']): { width: number; height: number } {
  if (aspect === '1:1') return { width: 1080, height: 1080 }
  if (aspect === '16:9') return { width: 1920, height: 1080 }
  return { width: 1080, height: 1920 } // 9:16
}

function variantTransition(kind?: VideoVariantKind): { in: string; out: string } | undefined {
  if (kind === 'fast_cuts') return { in: 'fade', out: 'fade' }
  if (kind === 'high_retention') return { in: 'fadeFast', out: 'fadeFast' }
  return undefined // clean educational / default: minimal
}

/**
 * Build Shotstack edit for Short-form Fitness Reel / generic plan.
 * Captions use title overlays from plan.hooks / instructions — not invented transcripts.
 */
export function buildShotstackEdit(input: {
  sourceUrl: string
  plan: VideoEditPlan & { variants?: VideoVariantKind[]; subtitle_style?: Record<string, unknown> }
  sourceDurationSec?: number | null
  callbackUrl?: string | null
  variant?: VideoVariantKind
  captionLines?: string[]
}): ShotstackEditJson {
  const aspect = input.plan.target_aspect || '9:16'
  const size = outputSize(aspect)
  const sourceDuration = input.sourceDurationSec && input.sourceDurationSec > 0
    ? input.sourceDurationSec
    : null

  const target =
    input.plan.duration_target_sec != null
      ? clamp(input.plan.duration_target_sec, 7, 60)
      : sourceDuration
        ? clamp(sourceDuration, 7, 60)
        : 30

  const clipsIn = (input.plan.clips || []).filter(
    (c) =>
      Number.isFinite(c.start_sec) &&
      Number.isFinite(c.end_sec) &&
      c.end_sec > c.start_sec &&
      c.start_sec >= 0
  )

  const videoClips: Array<Record<string, unknown>> = []
  let timelineCursor = 0

  if (clipsIn.length > 0) {
    let remaining = target
    for (const c of clipsIn) {
      if (remaining <= 0.3) break
      const rawLen = c.end_sec - c.start_sec
      const len = Math.min(rawLen, remaining)
      const clip: Record<string, unknown> = {
        asset: {
          type: 'video',
          src: input.sourceUrl,
          trim: Number(c.start_sec.toFixed(3)),
          volume: 1,
        },
        start: Number(timelineCursor.toFixed(3)),
        length: Number(len.toFixed(3)),
        fit: 'cover',
        scale: 1,
        position: 'center',
      }
      const tr = variantTransition(input.variant)
      if (tr) clip.transition = tr
      videoClips.push(clip)
      timelineCursor += len
      remaining -= len
    }
  } else {
    // Single clip: start at 0, length = target (or source if shorter)
    const len = sourceDuration ? Math.min(target, sourceDuration) : target
    const clip: Record<string, unknown> = {
      asset: {
        type: 'video',
        src: input.sourceUrl,
        trim: 0,
        volume: 1,
      },
      start: 0,
      length: Number(len.toFixed(3)),
      fit: 'cover',
      scale: 1,
      position: 'center',
    }
    const tr = variantTransition(input.variant)
    if (tr) clip.transition = tr
    videoClips.push(clip)
    timelineCursor = len
  }

  const tracks: ShotstackEditJson['timeline']['tracks'] = []

  // Caption / hook overlays (title assets) — only when captions enabled and text provided
  const captionLines = (input.captionLines || input.plan.hooks || [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 4)

  if (input.plan.captions && captionLines.length) {
    const titleClips: Array<Record<string, unknown>> = []
    // Strong first 1–2 seconds hook
    titleClips.push({
      asset: {
        type: 'title',
        text: captionLines[0]!.slice(0, 48),
        style: 'minimal',
        color: '#ffffff',
        size: 'small',
        background: '#000000',
        position: 'bottom',
      },
      start: 0,
      length: Math.min(2.2, timelineCursor || 2),
      fit: 'none',
      position: 'bottom',
      offset: { x: 0, y: -0.28 },
    })
    // Optional mid caption
    if (captionLines[1] && timelineCursor > 5) {
      titleClips.push({
        asset: {
          type: 'title',
          text: captionLines[1].slice(0, 48),
          style: 'minimal',
          color: '#ffffff',
          size: 'small',
          background: '#000000',
          position: 'bottom',
        },
        start: Math.min(4, timelineCursor / 2),
        length: Math.min(3, Math.max(1.5, timelineCursor / 4)),
        fit: 'none',
        position: 'bottom',
        offset: { x: 0, y: -0.28 },
      })
    }
    tracks.push({ clips: titleClips })
  }

  tracks.push({ clips: videoClips })

  const edit: ShotstackEditJson = {
    timeline: {
      background: '#000000',
      tracks,
    },
    output: {
      format: 'mp4',
      size,
      fps: 30,
      quality: 'high',
    },
  }

  if (input.callbackUrl) {
    edit.callback = input.callbackUrl
  }

  return edit
}

export function shotstackEditMetadata(edit: ShotstackEditJson) {
  const clips = edit.timeline.tracks.flatMap((t) => t.clips)
  const videoClips = clips.filter((c) => (c.asset as { type?: string })?.type === 'video')
  const duration = videoClips.reduce((sum, c) => sum + Number(c.length || 0), 0)
  return {
    preset: SHORT_FORM_FITNESS_REEL_PRESET,
    output_width: edit.output.size.width,
    output_height: edit.output.size.height,
    fps: edit.output.fps,
    format: edit.output.format,
    estimated_output_duration_sec: Number(duration.toFixed(3)),
    clip_count: videoClips.length,
    has_callback: Boolean(edit.callback),
  }
}
