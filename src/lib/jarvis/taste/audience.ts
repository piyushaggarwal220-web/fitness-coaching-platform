/**
 * Audience performance signals — NEVER converted into USER_TASTE.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { clampConfidence } from '@/lib/jarvis/taste/confidence'
import type { TasteDimension, TasteScope } from '@/lib/jarvis/taste/types'

/**
 * Record an audience/performance signal with explicit AUDIENCE_SIGNAL kind.
 * Does not create or strengthen USER_TASTE preferences.
 */
export async function recordAudienceSignal(input: {
  dimension: TasteDimension
  preference_key: string
  preference_value: string
  scope?: TasteScope
  confidence?: number
  summary: string
  sample_size?: number
}): Promise<{ ok: boolean; preference_id: string | null; note: string }> {
  const admin = createAdminClient()
  const scope = input.scope || 'INSTAGRAM_REEL'
  const fp = createHash('sha256')
    .update(
      ['AUDIENCE_SIGNAL', scope, input.dimension, input.preference_key, input.preference_value].join(
        '|'
      )
    )
    .digest('hex')
    .slice(0, 24)

  const confidence = clampConfidence(input.confidence ?? 0.4)
  const now = new Date().toISOString()

  const { data: existing } = await admin
    .from('jarvis_taste_preferences')
    .select('id, evidence_count, confidence')
    .eq('fingerprint', fp)
    .maybeSingle()

  if (existing) {
    await admin
      .from('jarvis_taste_preferences')
      .update({
        confidence: clampConfidence(
          Math.max(Number(existing.confidence), confidence)
        ),
        evidence_count: Number(existing.evidence_count || 0) + 1,
        last_observed_at: now,
        updated_at: now,
        explanation: `AUDIENCE_SIGNAL (not user taste): ${input.summary}`,
      })
      .eq('id', existing.id)

    await admin.from('jarvis_taste_evidence').insert({
      preference_id: existing.id,
      evidence_type: 'PERFORMANCE_SIGNAL',
      dimension: input.dimension,
      preference_key: input.preference_key,
      signal: 'AUDIENCE_PERFORMANCE',
      direction: 'NEUTRAL',
      confidence,
      signal_kind: 'AUDIENCE_SIGNAL',
      scope,
      feedback_text: input.summary.slice(0, 500),
      extracted: { sample_size: input.sample_size ?? null },
      fingerprint: createHash('sha256')
        .update(`PERF|${fp}|${now}|${input.summary.slice(0, 40)}`)
        .digest('hex')
        .slice(0, 28),
    })

    return {
      ok: true,
      preference_id: existing.id,
      note: 'Audience signal updated — not user taste.',
    }
  }

  const { data: inserted, error } = await admin
    .from('jarvis_taste_preferences')
    .insert({
      scope,
      dimension: input.dimension,
      preference_key: input.preference_key,
      preference_value: input.preference_value,
      polarity: 'PREFER',
      influence_mode: 'OBSERVATION',
      confidence,
      evidence_count: 1,
      positive_evidence_count: 1,
      negative_evidence_count: 0,
      source_types: ['PERFORMANCE_SIGNAL'],
      status: 'CANDIDATE',
      signal_kind: 'AUDIENCE_SIGNAL',
      explanation: `AUDIENCE_SIGNAL (not user taste): ${input.summary}`,
      fingerprint: fp,
      history: [
        {
          at: now,
          event: 'audience_signal',
          confidence_before: 0,
          confidence_after: confidence,
          note: input.summary.slice(0, 200),
        },
      ],
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { ok: false, preference_id: null, note: error?.message || 'insert failed' }
  }

  return {
    ok: true,
    preference_id: inserted.id,
    note: 'Audience signal recorded — never auto-promoted to USER_TASTE.',
  }
}
