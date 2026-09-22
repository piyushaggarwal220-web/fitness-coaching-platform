/**
 * Contextual taste retrieval — relevance over global dump.
 * Current instruction overrides stored taste for the turn.
 */

import { listTastePreferences } from '@/lib/jarvis/taste/store'
import { parseTasteFeedback } from '@/lib/jarvis/taste/parse'
import type {
  RetrievedTaste,
  TasteAppliedHint,
  TastePreference,
  TasteRetrievalContext,
  TasteScope,
} from '@/lib/jarvis/taste/types'

function scopesForContext(ctx: TasteRetrievalContext): TasteScope[] {
  const scopes: TasteScope[] = ['GLOBAL']
  const platform = (ctx.platform || '').toLowerCase()
  const format = (ctx.format || '').toLowerCase()
  if (platform.includes('instagram') || format.includes('reel')) {
    scopes.push('INSTAGRAM_REEL')
  }
  if (platform.includes('youtube') || format.includes('short')) {
    scopes.push('YOUTUBE_SHORT')
  }
  const pillar = (ctx.pillar || ctx.content_type || '').toUpperCase()
  if (pillar.includes('FAT')) scopes.push('FAT_LOSS')
  if (pillar.includes('MUSCLE')) scopes.push('MUSCLE_GAIN')
  if (pillar.includes('EDUCAT')) scopes.push('EDUCATIONAL')
  if (pillar.includes('TRANSFORM')) scopes.push('TRANSFORMATION')
  if (pillar.includes('STORY')) scopes.push('PERSONAL_STORY')
  const obj = (ctx.objective || '').toUpperCase()
  if (obj.includes('SALES') || obj.includes('CHECKOUT')) scopes.push('SALES')
  scopes.push('HOOK', 'CTA')
  return scopes
}

function relevanceScore(
  pref: TastePreference,
  scopes: TasteScope[],
  ctx: TasteRetrievalContext
): number {
  let score = pref.confidence * 10
  if (scopes.includes(pref.scope)) score += pref.scope === 'GLOBAL' ? 2 : 5
  if (pref.status === 'ACTIVE') score += 4
  if (pref.status === 'CANDIDATE') score += 1
  if (pref.status === 'CONFLICTED' || pref.status === 'STALE') score -= 3
  if (pref.status === 'REJECTED') score -= 100
  if (pref.influence_mode === 'HARD_CONSTRAINT') score += 8
  if (pref.influence_mode === 'STRONG_PREFERENCE') score += 3
  if (ctx.funnel_id && pref.scope === 'FUNNEL' && pref.scope_id === ctx.funnel_id) {
    score += 6
  }
  return score
}

/**
 * Retrieve relevant taste for Creative Director / Video Editor.
 */
export async function retrieveTaste(
  ctx: TasteRetrievalContext = {}
): Promise<RetrievedTaste> {
  const scopes = scopesForContext(ctx)
  const all = await listTastePreferences({
    status: ['ACTIVE', 'CANDIDATE', 'CONFLICTED', 'STALE'],
    limit: 80,
  })

  const user = all.filter((p) => p.signal_kind === 'USER_TASTE')
  const audience = all.filter((p) => p.signal_kind === 'AUDIENCE_SIGNAL')

  const scored = user
    .map((p) => ({ p, score: relevanceScore(p, scopes, ctx) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const limit = ctx.limit ?? 12
  const preferences = scored.slice(0, limit).map((x) => x.p)
  const conflicts = preferences.filter((p) => p.status === 'CONFLICTED')

  const instruction = ctx.current_instruction?.trim() || null
  const overrides: string[] = []
  const applied: TasteAppliedHint[] = []
  const instructionKeys = new Set<string>()

  if (instruction) {
    overrides.push(instruction)
    for (const s of parseTasteFeedback(instruction)) {
      if (s.signal === 'SENSITIVE_INFERENCE_BLOCKED') continue
      instructionKeys.add(s.preference_key)
      applied.push({
        dimension: s.dimension,
        preference_key: s.preference_key,
        preference_value: s.preference_value,
        confidence: 1,
        influence_mode: 'HARD_CONSTRAINT',
        reason: 'Current user instruction overrides stored taste for this turn.',
        signal_kind: 'USER_TASTE',
      })
    }
  }

  for (const pref of preferences) {
    if (pref.status === 'REJECTED') continue
    if (instructionKeys.has(pref.preference_key)) continue
    if (pref.influence_mode === 'OBSERVATION' && pref.status !== 'ACTIVE') continue
    if (pref.confidence < 0.4 && pref.status !== 'ACTIVE') continue

    applied.push({
      dimension: pref.dimension,
      preference_key: pref.preference_key,
      preference_value: pref.preference_value,
      confidence: pref.confidence,
      influence_mode: pref.influence_mode,
      reason: `Active taste ${pref.dimension}.${pref.preference_key}=${pref.preference_value} (confidence ${pref.confidence}, n=${pref.evidence_count})`,
      signal_kind: 'USER_TASTE',
    })
  }

  const audienceHints = audience
    .filter((p) => p.status === 'ACTIVE' || p.confidence >= 0.4)
    .slice(0, 5)

  return {
    preferences: preferences.filter((p) => p.signal_kind === 'USER_TASTE'),
    audience_signals: audienceHints,
    conflicts,
    current_instruction_overrides: overrides,
    applied,
    note: instruction
      ? 'Current instruction takes precedence over stored taste.'
      : 'Taste retrieved by relevance.',
  }
}

/** Pure retrieval over an in-memory preference list (tests). */
export function retrieveTasteSync(
  prefs: TastePreference[],
  ctx: TasteRetrievalContext = {}
): RetrievedTaste {
  const scopes = scopesForContext(ctx)
  const user = prefs.filter((p) => p.signal_kind === 'USER_TASTE')
  const audience = prefs.filter((p) => p.signal_kind === 'AUDIENCE_SIGNAL')
  const scored = user
    .map((p) => ({ p, score: relevanceScore(p, scopes, ctx) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  const preferences = scored.slice(0, ctx.limit ?? 12).map((x) => x.p)
  const instruction = ctx.current_instruction?.trim() || null
  const applied: TasteAppliedHint[] = []
  const overrides: string[] = []
  const instructionKeys = new Set<string>()
  if (instruction) {
    overrides.push(instruction)
    for (const s of parseTasteFeedback(instruction)) {
      instructionKeys.add(s.preference_key)
      applied.push({
        dimension: s.dimension,
        preference_key: s.preference_key,
        preference_value: s.preference_value,
        confidence: 1,
        influence_mode: 'HARD_CONSTRAINT',
        reason: 'Current user instruction overrides stored taste for this turn.',
        signal_kind: 'USER_TASTE',
      })
    }
  }
  for (const pref of preferences) {
    if (instructionKeys.has(pref.preference_key)) continue
    if (pref.confidence < 0.4 && pref.status !== 'ACTIVE') continue
    applied.push({
      dimension: pref.dimension,
      preference_key: pref.preference_key,
      preference_value: pref.preference_value,
      confidence: pref.confidence,
      influence_mode: pref.influence_mode,
      reason: `taste ${pref.preference_key}=${pref.preference_value}`,
      signal_kind: 'USER_TASTE',
    })
  }
  return {
    preferences,
    audience_signals: audience.slice(0, 5),
    conflicts: preferences.filter((p) => p.status === 'CONFLICTED'),
    current_instruction_overrides: overrides,
    applied,
    note: instruction ? 'Current instruction wins.' : 'ok',
  }
}

export function tasteHintsToBooleans(applied: TasteAppliedHint[]): {
  minimal_zooms: boolean
  reduce_overlays: boolean
  fast_hooks: boolean
  soft_cta: boolean
} {
  return {
    minimal_zooms: applied.some(
      (a) =>
        a.preference_key === 'zoom_frequency' &&
        (a.preference_value === 'restrained' || a.influence_mode === 'HARD_CONSTRAINT')
    ),
    reduce_overlays: applied.some(
      (a) =>
        (a.preference_key === 'caption_density' || a.preference_key === 'text_density') &&
        a.preference_value === 'minimal'
    ),
    fast_hooks: applied.some(
      (a) => a.preference_key === 'hook_pace' && a.preference_value === 'fast'
    ),
    soft_cta: applied.some(
      (a) => a.preference_key === 'cta_tone' && a.preference_value === 'soft'
    ),
  }
}
