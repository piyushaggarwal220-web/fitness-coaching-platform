/**
 * EDL → Shotstack Edit JSON translator.
 * Canonical EDL remains provider-agnostic; this module only produces provider payload.
 */

import type { EditDecisionList } from '@/lib/jarvis/video/editor/types'
import { sec } from '@/lib/jarvis/video/editor/types'
import type { ShotstackEditJson } from '@/lib/jarvis/video/shotstack/edit-builder'
import { SHORT_FORM_FITNESS_REEL_PRESET } from '@/lib/jarvis/video/presets'

export type ShotstackTranslateResult = {
  ok: boolean
  edit: ShotstackEditJson | null
  unsupported: string[]
  errors: string[]
  estimated_duration_sec: number
}

function transitionToShotstack(kind: string): { in: string; out: string } | undefined {
  if (kind === 'FADE') return { in: 'fade', out: 'fade' }
  if (kind === 'CROSSFADE') return { in: 'fadeFast', out: 'fadeFast' }
  return undefined // CUT = no transition object
}

/**
 * @param sourceUrlByRef map of jarvis-video:// ref → temporary signed URL
 */
export function translateEdlToShotstack(input: {
  edl: EditDecisionList
  sourceUrlByRef: Record<string, string>
  callbackUrl?: string | null
}): ShotstackTranslateResult {
  const unsupported: string[] = []
  const errors: string[] = []
  const edl = input.edl

  for (const u of edl.unsupported_features) {
    if (u.status === 'UNSUPPORTED') unsupported.push(u.feature)
  }

  const usable = edl.timeline.filter((c) => !c.missing)
  if (!usable.length) {
    return {
      ok: false,
      edit: null,
      unsupported,
      errors: ['No usable clips to translate'],
      estimated_duration_sec: 0,
    }
  }

  const videoClips: Array<Record<string, unknown>> = []
  let cursor = 0

  for (const c of usable) {
    const ref = c.source_ref
    if (!ref || !input.sourceUrlByRef[ref]) {
      errors.push(`Missing resolved URL for ${ref || c.source_id}`)
      continue
    }
    const lengthSec = sec(c.timeline_end_ms - c.timeline_start_ms)
    const trimSec = sec(c.source_start_ms)
    if (c.playback_rate !== 1) {
      unsupported.push(`playback_rate:${c.playback_rate}`)
    }
    const clip: Record<string, unknown> = {
      asset: {
        type: 'video',
        src: input.sourceUrlByRef[ref],
        trim: Number(trimSec.toFixed(3)),
        volume: edl.audio.mute ? 0 : edl.audio.source_volume,
      },
      start: Number(cursor.toFixed(3)),
      length: Number(lengthSec.toFixed(3)),
      fit: 'cover',
      scale: c.scale,
      position: 'center',
    }
    const tr = transitionToShotstack(c.transition_in)
    if (tr) clip.transition = tr
    videoClips.push(clip)
    cursor += lengthSec
  }

  if (!videoClips.length) {
    return {
      ok: false,
      edit: null,
      unsupported,
      errors: errors.length ? errors : ['No video clips produced'],
      estimated_duration_sec: 0,
    }
  }

  const titleClips: Array<Record<string, unknown>> = []
  for (const o of edl.overlays.slice(0, 6)) {
    titleClips.push({
      asset: {
        type: 'title',
        text: o.text.slice(0, 48),
        style: 'minimal',
        color: '#ffffff',
        size: 'small',
        background: '#000000',
        position: o.position === 'top' ? 'top' : 'bottom',
      },
      start: Number(sec(o.start_ms).toFixed(3)),
      length: Number(Math.max(0.5, sec(o.end_ms - o.start_ms)).toFixed(3)),
      fit: 'none',
      position: o.position === 'top' ? 'top' : 'bottom',
      offset: { x: 0, y: o.position === 'top' ? 0.28 : -0.28 },
    })
  }

  const tracks: ShotstackEditJson['timeline']['tracks'] = []
  if (titleClips.length) tracks.push({ clips: titleClips })
  tracks.push({ clips: videoClips })

  const edit: ShotstackEditJson = {
    timeline: {
      background: '#000000',
      tracks,
    },
    output: {
      format: 'mp4',
      size: { width: edl.output.width, height: edl.output.height },
      fps: edl.output.fps,
      quality: 'high',
    },
  }
  if (input.callbackUrl) edit.callback = input.callbackUrl

  return {
    ok: errors.length === 0,
    edit,
    unsupported: [...new Set(unsupported)],
    errors,
    estimated_duration_sec: Number(cursor.toFixed(3)),
  }
}

export function shotstackTranslateMetadata(edit: ShotstackEditJson) {
  const clips = edit.timeline.tracks.flatMap((t) => t.clips)
  const videoClips = clips.filter((c) => (c.asset as { type?: string })?.type === 'video')
  const duration = videoClips.reduce((sum, c) => sum + Number(c.length || 0), 0)
  return {
    preset: SHORT_FORM_FITNESS_REEL_PRESET,
    translator: 'edl_to_shotstack_v1',
    output_width: edit.output.size.width,
    output_height: edit.output.size.height,
    fps: edit.output.fps,
    estimated_output_duration_sec: Number(duration.toFixed(3)),
    clip_count: videoClips.length,
  }
}
