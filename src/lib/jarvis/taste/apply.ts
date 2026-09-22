/**
 * Apply taste to Creative Director / EDL planning contexts.
 * Explicit creative/handoff instructions win over soft taste.
 */

import type { EditDecisionList } from '@/lib/jarvis/video/editor/types'
import type { TasteAppliedHint, RetrievedTaste } from '@/lib/jarvis/taste/types'
import { tasteHintsToBooleans } from '@/lib/jarvis/taste/retrieve'

export type TasteCreativeEffects = {
  minimal_zooms: boolean
  reduce_overlays: boolean
  fast_hooks: boolean
  soft_cta: boolean
  preferences_applied: string[]
  taste_influences: TasteAppliedHint[]
  audience_notes: string[]
}

export function effectsFromRetrievedTaste(taste: RetrievedTaste): TasteCreativeEffects {
  const bools = tasteHintsToBooleans(taste.applied)
  return {
    ...bools,
    preferences_applied: taste.applied
      .filter((a) => a.signal_kind === 'USER_TASTE')
      .map(
        (a) =>
          `${a.preference_key}=${a.preference_value} (conf ${a.confidence.toFixed(2)}, ${a.influence_mode})`
      ),
    taste_influences: taste.applied.filter((a) => a.signal_kind === 'USER_TASTE'),
    audience_notes: taste.audience_signals.map(
      (a) =>
        `AUDIENCE_SIGNAL: ${a.preference_key}=${a.preference_value} (not user taste, conf ${a.confidence})`
    ),
  }
}

/**
 * Apply soft taste defaults onto an EDL without inventing footage.
 * Does NOT override clips that already encode explicit creative decisions
 * when those conflict with a SOFT preference only.
 */
export function applyTasteToEdl(
  edl: EditDecisionList,
  effects: TasteCreativeEffects,
  opts?: { dramatic_zoom_requested?: boolean }
): { edl: EditDecisionList; applied: string[] } {
  const next = JSON.parse(JSON.stringify(edl)) as EditDecisionList
  const applied: string[] = []

  if (effects.minimal_zooms && !opts?.dramatic_zoom_requested) {
    for (const c of next.timeline) {
      if (c.scale > 1) {
        c.scale = 1
        applied.push(`Restrained zoom on ${c.purpose} (taste)`)
      }
    }
    next.unsupported_features = next.unsupported_features.filter(
      (u) => u.feature !== 'aggressive_zoom'
    )
  }

  if (effects.reduce_overlays) {
    if (next.overlays.length > 2) {
      next.overlays = next.overlays.slice(0, 2)
      applied.push('Reduced overlays to match minimal text taste')
    }
    if (next.captions.length > 2) {
      next.captions = next.captions.slice(0, 2)
      applied.push('Reduced captions to match minimal caption taste')
    }
  }

  if (effects.fast_hooks) {
    const hook = next.timeline.find((c) => c.purpose === 'HOOK' && !c.missing)
    if (hook) {
      const dur = hook.timeline_end_ms - hook.timeline_start_ms
      if (dur > 2500) {
        const newDur = 2000
        const shrink = dur - newDur
        hook.source_end_ms = hook.source_start_ms + newDur
        hook.timeline_end_ms = hook.timeline_start_ms + newDur
        for (const c of next.timeline) {
          if (c.timeline_start_ms >= hook.timeline_start_ms + dur) {
            c.timeline_start_ms -= shrink
            c.timeline_end_ms -= shrink
          }
        }
        applied.push('Shortened hook toward fast-hook taste')
      }
    }
  }

  if (applied.length) {
    next.warnings = [
      ...next.warnings,
      ...applied.map((a) => `TASTE_APPLIED: ${a}`),
    ]
  }

  return { edl: next, applied }
}

export function formatTasteForCreativePlan(effects: TasteCreativeEffects): string[] {
  const lines = [...effects.preferences_applied]
  for (const a of effects.audience_notes) lines.push(a)
  return lines
}
