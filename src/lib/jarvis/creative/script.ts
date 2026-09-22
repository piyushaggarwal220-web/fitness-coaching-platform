/**
 * Script engine — distinguishes spoken footage vs overlays vs new recording.
 * Never pretends generated text was spoken in original footage.
 */

import type { SourceMapping } from '@/lib/jarvis/video/intelligence/types'
import type { CreativeHook, ScriptBeat, StructureId } from '@/lib/jarvis/creative/types'
import { STRUCTURE_CATALOG } from '@/lib/jarvis/creative/types'

export function buildScriptBeats(input: {
  structure_id: StructureId
  hook: CreativeHook
  bodySegments: Array<{ text: string; mapping: SourceMapping }>
  cta: string
  hasSpokenCta: boolean
  ctaMapping?: SourceMapping | null
  reduceOverlays?: boolean
}): {
  beats: ScriptBeat[]
  overlays: string[]
  new_recording_requirements: string[]
  estimated_duration_sec: number
} {
  const steps = STRUCTURE_CATALOG[input.structure_id]
  const beats: ScriptBeat[] = []
  const overlays: string[] = []
  const new_recording_requirements: string[] = []
  let bodyIdx = 0

  for (const step of steps) {
    if (step === 'HOOK' || step === 'QUESTION') {
      if (input.hook.source_support && input.hook.source_excerpt) {
        beats.push({
          role: step,
          kind: 'SPOKEN_FOOTAGE',
          text: input.hook.source_excerpt,
          source: input.bodySegments[0]?.mapping
            ? undefined
            : null,
          duration_estimate_sec: Math.max(
            3,
            estimateSpeechSec(input.hook.source_excerpt)
          ),
          notes: 'Spoken hook from footage',
        })
        // Attach first mapping if role is hook — caller should pass hook mapping separately
      } else {
        beats.push({
          role: step,
          kind: 'NEW_RECORDING_REQUIRED',
          text: input.hook.text,
          duration_estimate_sec: Math.max(3, estimateSpeechSec(input.hook.text)),
          notes: 'Hook not present in footage',
        })
        new_recording_requirements.push(`Record hook: ${input.hook.text.slice(0, 100)}`)
      }
      continue
    }

    if (step === 'CTA') {
      if (input.hasSpokenCta && input.ctaMapping) {
        beats.push({
          role: 'CTA',
          kind: 'SPOKEN_FOOTAGE',
          text: input.cta,
          source: input.ctaMapping,
          duration_estimate_sec: Math.max(2, Number(
            (input.ctaMapping.end - input.ctaMapping.start).toFixed(1)
          )),
        })
      } else {
        beats.push({
          role: 'CTA',
          kind: 'NEW_RECORDING_REQUIRED',
          text: input.cta,
          duration_estimate_sec: 4,
          notes: 'CTA not found in footage',
        })
        new_recording_requirements.push(`Record CTA (~4s): ${input.cta}`)
        if (!input.reduceOverlays) {
          overlays.push(input.cta)
        }
      }
      continue
    }

    const body = input.bodySegments.filter((b) => b.mapping.role !== 'hook')[bodyIdx++]
    if (body) {
      const dur = Math.max(2, Number((body.mapping.end - body.mapping.start).toFixed(1)))
      beats.push({
        role: step,
        kind: 'SPOKEN_FOOTAGE',
        text: body.text,
        source: body.mapping,
        duration_estimate_sec: dur,
      })
    } else {
      const placeholder = `${step.toLowerCase().replace(/_/g, ' ')} beat needs footage or a short recording`
      beats.push({
        role: step,
        kind: 'NEW_RECORDING_REQUIRED',
        text: placeholder,
        duration_estimate_sec: 5,
      })
      new_recording_requirements.push(`Missing ${step}: record or film supporting clip`)
    }
  }

  // Attach hook source mapping onto first SPOKEN hook beat if provided via bodySegments with role
  const hookMap = input.bodySegments.find((b) => b.mapping.role === 'hook')
  if (hookMap) {
    const hookBeat = beats.find((b) => b.role === 'HOOK' || b.role === 'QUESTION')
    if (hookBeat && hookBeat.kind === 'SPOKEN_FOOTAGE') {
      hookBeat.source = hookMap.mapping
      hookBeat.duration_estimate_sec = Math.max(
        2,
        Number((hookMap.mapping.end - hookMap.mapping.start).toFixed(1))
      )
      hookBeat.text = hookMap.text || hookBeat.text
    }
  }

  if (!input.reduceOverlays && input.hook.text && input.hook.source_support) {
    overlays.push(input.hook.text.slice(0, 80))
  }

  const estimated_duration_sec = Number(
    beats.reduce((s, b) => s + b.duration_estimate_sec, 0).toFixed(1)
  )

  return { beats, overlays, new_recording_requirements, estimated_duration_sec }
}

function estimateSpeechSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(20, Math.max(2, words / 2.5))
}

/** Attach explicit hook mapping into body list for script builder. */
export function withHookMapping(
  hookMapping: SourceMapping | null | undefined,
  hookText: string,
  bodies: Array<{ text: string; mapping: SourceMapping }>
): Array<{ text: string; mapping: SourceMapping }> {
  if (!hookMapping) return bodies
  return [{ text: hookText, mapping: { ...hookMapping, role: 'hook' } }, ...bodies]
}
