/**
 * Creative revision + feedback loop.
 * Revises only requested dimensions; preserves useful content; versions history.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import {
  extractExplicitPreference,
  isVagueComplaint,
  storeExplicitPreference,
} from '@/lib/jarvis/memory/preferences'
import { pickCta, normalizeObjective } from '@/lib/jarvis/creative/cta'
import { buildHookFromFootage, generateHookVariants } from '@/lib/jarvis/creative/hooks'
import { buildScriptBeats, withHookMapping } from '@/lib/jarvis/creative/script'
import { runCreativeQualityChecks } from '@/lib/jarvis/creative/quality'
import { buildEditHandoff } from '@/lib/jarvis/creative/handoff'
import {
  appendFeedbackLog,
  loadCreativeById,
  saveCreativePlan,
} from '@/lib/jarvis/creative/store'
import type { CreativePlan, CreativeFeedback } from '@/lib/jarvis/creative/types'
import type { SourceMapping } from '@/lib/jarvis/video/intelligence/types'

export type RevisionTarget =
  | 'HOOK'
  | 'STRUCTURE'
  | 'SOURCE_FOOTAGE'
  | 'CTA'
  | 'TONE'
  | 'DURATION'
  | 'CAPTIONS'
  | 'ANGLE'
  | 'SALES_ORIENTATION'
  | 'TAKE'

export function detectRevisionTargets(feedback: string): RevisionTarget[] {
  const f = feedback.toLowerCase()
  const targets: RevisionTarget[] = []
  if (/hook/.test(f)) targets.push('HOOK')
  if (/structure|flow|order/.test(f)) targets.push('STRUCTURE')
  if (/footage|clip|source|take/.test(f)) targets.push('SOURCE_FOOTAGE')
  if (/second take|take 2|take b|use the second/.test(f)) targets.push('TAKE')
  if (/cta|call to action/.test(f)) targets.push('CTA')
  if (/tone|aggressive|soft|salesy|educational/.test(f)) targets.push('TONE')
  if (/long|short|duration|too long|shorter/.test(f)) targets.push('DURATION')
  if (/caption|overlay|zoom/.test(f)) targets.push('CAPTIONS')
  if (/angle|concept|topic/.test(f)) targets.push('ANGLE')
  if (/salesy|sell|funnel|offer/.test(f)) targets.push('SALES_ORIENTATION')
  if (!targets.length && !isVagueComplaint(feedback)) targets.push('ANGLE')
  return targets
}

export async function reviseCreative(input: CreativeFeedback): Promise<{
  ok: boolean
  status: string
  content_id: string | null
  version: number | null
  plan: CreativePlan | null
  revised_targets: RevisionTarget[]
  preference_prompt: string | null
  preference_stored: boolean
  note: string
  cost_usd: number
}> {
  const budget = await assertAiBudgetAvailable(0.03)
  if (!budget.ok) {
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      content_id: null,
      version: null,
      plan: null,
      revised_targets: [],
      preference_prompt: null,
      preference_stored: false,
      note: budget.reason,
      cost_usd: 0,
    }
  }

  const existing = await loadCreativeById(input.creative_id)
  if (!existing?.plan) {
    return {
      ok: false,
      status: 'failed',
      content_id: null,
      version: null,
      plan: null,
      revised_targets: [],
      preference_prompt: null,
      preference_stored: false,
      note: 'Creative not found',
      cost_usd: 0,
    }
  }

  const targets = detectRevisionTargets(input.feedback)
  const plan: CreativePlan = structuredClone(existing.plan)
  const fb = input.feedback.toLowerCase()

  if (targets.includes('HOOK')) {
    const variants = generateHookVariants({
      baseSpoken: plan.hook.source_excerpt,
      topic: plan.title,
      max: 3,
    })
    const next = variants.find((v) => v.text !== plan.hook.text) || variants[0]
    if (next) plan.hook = next
  }

  if (targets.includes('CAPTIONS')) {
    plan.overlays = plan.overlays.slice(0, Math.max(1, Math.floor(plan.overlays.length / 2)))
    plan.preferences_applied = [
      ...plan.preferences_applied,
      'Reduced overlays from feedback',
    ]
  }

  if (targets.includes('SALES_ORIENTATION') || /salesy|more sales/.test(fb)) {
    plan.objective = 'SALES'
    const { cta } = pickCta({ objective: 'SALES', funnelHint: plan.funnel_id })
    plan.cta = cta
    plan.tone = 'direct offer-oriented (still claim-safe)'
  } else if (/more educational|less sales/.test(fb)) {
    plan.objective = 'EDUCATION'
    const { cta } = pickCta({ objective: 'EDUCATION' })
    plan.cta = cta
    plan.tone = 'educational, practical'
  }

  if (targets.includes('CTA')) {
    const obj = normalizeObjective(plan.objective)
    const { cta } = pickCta({ objective: obj })
    plan.cta = cta
  }

  if (targets.includes('TONE')) {
    if (/aggressive/.test(fb)) plan.tone = 'direct, assertive'
    else if (/soft|gentle/.test(fb)) plan.tone = 'calm, supportive'
  }

  if (targets.includes('DURATION') || /too long|shorter/.test(fb)) {
    plan.script_beats = plan.script_beats.filter((b) => b.role !== 'POINT_3')
    plan.estimated_duration_sec = Number(
      plan.script_beats.reduce((s, b) => s + b.duration_estimate_sec, 0).toFixed(1)
    )
  }

  if (targets.includes('TAKE') || targets.includes('SOURCE_FOOTAGE')) {
    // Prefer second take from take groups when available
    const replaced = await trySwapToSecondTake(plan)
    if (replaced) {
      plan.evidence = [...plan.evidence, 'source_swapped_to_second_take']
    } else if (/don't use this footage|do not use this footage/.test(fb)) {
      plan.source_segments = []
      plan.missing_material = [...plan.missing_material, 'Replacement footage required']
      for (const b of plan.script_beats) {
        if (b.kind === 'SPOKEN_FOOTAGE') {
          b.kind = 'NEW_RECORDING_REQUIRED'
          b.source = null
        }
      }
    }
  }

  // Rebuild script if hook/cta/captions changed, preserving spoken mappings where possible
  if (targets.some((t) => ['HOOK', 'CTA', 'CAPTIONS', 'DURATION'].includes(t))) {
    const hookMap = plan.source_segments.find((s) => s.role === 'hook')
    const bodies = plan.source_segments
      .filter((s) => s.role !== 'hook' && s.role !== 'cta')
      .map((m) => ({ text: plan.concept, mapping: m }))
    const withHook = withHookMapping(hookMap, plan.hook.source_excerpt || plan.hook.text, bodies)
    const ctaMap = plan.source_segments.find((s) => s.role === 'cta')
    const script = buildScriptBeats({
      structure_id: plan.structure_id,
      hook: plan.hook,
      bodySegments: withHook,
      cta: plan.cta,
      hasSpokenCta: Boolean(ctaMap),
      ctaMapping: ctaMap ?? null,
      reduceOverlays: targets.includes('CAPTIONS') || /caption|overlay/.test(fb),
    })
    plan.script_beats = script.beats
    plan.overlays = script.overlays
    plan.new_recording_requirements = script.new_recording_requirements
    plan.estimated_duration_sec = script.estimated_duration_sec
  }

  plan.review_status = 'REVISION_REQUESTED'
  plan.quality = runCreativeQualityChecks({
    source_segments: plan.source_segments,
    script_beats: plan.script_beats,
    hook: plan.hook,
    cta: plan.cta,
    objective: plan.objective,
    estimated_duration_sec: plan.estimated_duration_sec,
    target_duration_sec: plan.target_duration_sec,
  })
  plan.claim_flags = plan.quality.claim_flags
  plan.edit_handoff = buildEditHandoff({
    duration: plan.estimated_duration_sec,
    source_segments: plan.source_segments,
    beats: plan.script_beats,
    overlays: plan.overlays,
    new_recording: plan.new_recording_requirements,
    cta: plan.cta,
  })
  plan.parent_fingerprint = existing.concept_fingerprint
  plan.current_instruction_override = input.feedback

  await appendFeedbackLog(input.creative_id, {
    feedback: input.feedback,
    targets,
  })

  // Mark previous as superseded path via parent link on new version
  const saved = await saveCreativePlan({
    plan,
    actorId: input.actorId,
    sessionId: existing.video_session_id,
    parentContentId: existing.id,
    version: (existing.version || 1) + 1,
    changeReason: input.feedback.slice(0, 500),
    funnelId: existing.funnel_id,
  })

  // Archive prior? Keep as history — set status revision_requested on parent
  const admin = createAdminClient()
  await admin
    .from('marketing_content')
    .update({ status: 'revision_requested', updated_at: new Date().toISOString() })
    .eq('id', existing.id)

  let preference_prompt: string | null = null
  let preference_stored = false
  const explicit = extractExplicitPreference(input.feedback)
  if (input.remember_preference && explicit) {
    const stored = await storeExplicitPreference({
      statement: explicit.statement,
      kind: explicit.kind,
      scope: explicit.scope,
      actorId: input.actorId,
    })
    preference_stored = stored.ok
  } else if (
    /zoom|caption|overlay/.test(fb) &&
    /don't|do not|less|minimal|so many/.test(fb) &&
    !input.remember_preference
  ) {
    preference_prompt =
      'Should I remember this as a durable creative preference for future plans?'
  }

  await recordCostUsage({
    toolName: 'creative.revise',
    category: 'tool',
    costUsd: 0.01,
    metadata: { targets, parent: existing.id },
  }).catch(() => null)

  return {
    ok: true,
    status: 'ok',
    content_id: saved.id,
    version: saved.version,
    plan,
    revised_targets: targets,
    preference_prompt,
    preference_stored,
    note: `Revised ${targets.join(', ') || 'general'}. Version ${saved.version} saved. Not published.`,
    cost_usd: 0.01,
  }
}

async function trySwapToSecondTake(plan: CreativePlan): Promise<boolean> {
  if (!plan.source_segments.length) return false
  const admin = createAdminClient()
  const sourceIds = [...new Set(plan.source_segments.map((s) => s.source_id))]
  const { data: groups } = await admin
    .from('jarvis_video_take_groups')
    .select('source_ids, segment_ids')
    .limit(20)
  if (!groups?.length) return false

  for (const g of groups) {
    const ids = (g.source_ids || []) as string[]
    const overlap = ids.filter((id) => sourceIds.includes(id))
    if (overlap.length && ids.length > 1) {
      const alt = ids.find((id) => id !== overlap[0])
      if (!alt) continue
      plan.source_segments = plan.source_segments.map((s) =>
        s.source_id === overlap[0] ? { ...s, source_id: alt } : s
      )
      for (const b of plan.script_beats) {
        if (b.source?.source_id === overlap[0]) {
          b.source = { ...b.source, source_id: alt }
        }
      }
      return true
    }
  }
  return false
}

/** Pure helper for tests — apply revision without DB. */
export function applyRevisionInMemory(
  plan: CreativePlan,
  feedback: string
): { plan: CreativePlan; targets: RevisionTarget[] } {
  const targets = detectRevisionTargets(feedback)
  const next = structuredClone(plan)
  if (targets.includes('HOOK')) {
    next.hook = buildHookFromFootage({
      spokenExcerpt: next.hook.source_excerpt,
      ideaHint: next.title,
      allowRewrite: true,
    })
  }
  if (targets.includes('CAPTIONS') || /so many captions|fewer captions/.test(feedback.toLowerCase())) {
    next.overlays = next.overlays.slice(0, 1)
  }
  if (/salesy/.test(feedback.toLowerCase())) {
    next.objective = 'SALES'
    next.cta = pickCta({ objective: 'SALES' }).cta
  }
  next.review_status = 'REVISION_REQUESTED'
  return { plan: next, targets }
}

// keep SourceMapping import used for clarity in take swap
export type { SourceMapping }
