/**
 * Memory + Taste context for Creative Director.
 * Priority: current instruction > hard taste > preferences > rules > lessons.
 * USER_TASTE ≠ AUDIENCE_SIGNAL.
 */

import {
  planningHintsFromMemory,
  retrieveRelevantMemory,
  type RetrievedMemory,
} from '@/lib/jarvis/memory/retrieval'
import {
  retrieveTaste,
  effectsFromRetrievedTaste,
  type TasteAppliedHint,
  type RetrievedTaste,
} from '@/lib/jarvis/taste'

export type CreativeMemoryContext = {
  preferences: string[]
  lessons: string[]
  constraints: string[]
  hypotheses: string[]
  current_instruction: string | null
  reduce_overlays: boolean
  minimal_zooms: boolean
  fast_hooks: boolean
  soft_cta: boolean
  taste_influences: TasteAppliedHint[]
  audience_notes: string[]
  taste: RetrievedTaste | null
  memories: RetrievedMemory[]
}

export async function loadCreativeMemoryContext(input: {
  query: string
  current_instruction?: string | null
  funnel_id?: string | null
  platform?: string | null
  objective?: string | null
  pillar?: string | null
}): Promise<CreativeMemoryContext> {
  let memories: RetrievedMemory[] = []
  try {
    const res = await retrieveRelevantMemory({
      query: input.query,
      limit: 10,
      kinds: ['USER_PREFERENCE', 'PREFERENCE', 'OPERATING_RULE', 'LESSON', 'HYPOTHESIS'],
      funnelId: input.funnel_id || undefined,
      currentInstruction: input.current_instruction,
      scope: 'VIDEO_STYLE',
    })
    memories = res.memories
  } catch {
    memories = []
  }

  let taste: RetrievedTaste | null = null
  try {
    taste = await retrieveTaste({
      platform: input.platform,
      objective: input.objective,
      pillar: input.pillar,
      funnel_id: input.funnel_id,
      current_instruction: input.current_instruction,
      limit: 12,
    })
  } catch {
    taste = null
  }

  const hints = planningHintsFromMemory(memories)
  const prefText = hints.preferences.join(' ').toLowerCase()
  const instr = (input.current_instruction || '').toLowerCase()
  const effects = taste
    ? effectsFromRetrievedTaste(taste)
    : {
        minimal_zooms: false,
        reduce_overlays: false,
        fast_hooks: false,
        soft_cta: false,
        preferences_applied: [],
        taste_influences: [] as TasteAppliedHint[],
        audience_notes: [] as string[],
      }

  const minimal_zooms =
    (/zoom/.test(instr) && /minimal|no |don't|do not|less/.test(instr)) ||
    effects.minimal_zooms ||
    (/minimal|no |don't|less/.test(prefText) && /zoom/.test(prefText))

  const reduce_overlays =
    (/caption|overlay/.test(instr) && /less|fewer|minimal|don't|do not/.test(instr)) ||
    effects.reduce_overlays ||
    (/minimal|short|fewer|less/.test(prefText) && /caption|overlay/.test(prefText))

  return {
    preferences: [
      ...hints.preferences,
      ...effects.preferences_applied,
    ].slice(0, 12),
    lessons: hints.lessons,
    constraints: hints.constraints,
    hypotheses: hints.hypotheses,
    current_instruction: input.current_instruction ?? null,
    reduce_overlays,
    minimal_zooms,
    fast_hooks: effects.fast_hooks,
    soft_cta: effects.soft_cta,
    taste_influences: effects.taste_influences,
    audience_notes: effects.audience_notes,
    taste,
    memories,
  }
}

/** Current instruction always wins over stored preference for this turn. */
export function applyInstructionOverrides(
  ctx: CreativeMemoryContext,
  instruction: string | null | undefined
): CreativeMemoryContext {
  if (!instruction?.trim()) return ctx
  const instr = instruction.toLowerCase()
  return {
    ...ctx,
    current_instruction: instruction,
    reduce_overlays:
      /caption|overlay/.test(instr) && /less|fewer|minimal|don't|do not|so many/.test(instr)
        ? true
        : ctx.reduce_overlays,
    minimal_zooms:
      /zoom/.test(instr) && /minimal|no |don't|do not|less/.test(instr)
        ? true
        : /dramatic zoom|add (?:a )?zoom|more zoom/.test(instr)
          ? false
          : ctx.minimal_zooms,
    fast_hooks:
      /hook|first (?:two|2)/.test(instr) && /fast|short/.test(instr)
        ? true
        : ctx.fast_hooks,
  }
}
