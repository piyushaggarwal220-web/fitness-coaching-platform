import {
  calculateComplexityScore,
  toDisplayScore,
  toStoredTier,
  type ComplexityScoreResult,
} from '@/lib/ai/complexity-score'
import { profileToComplexityInput } from '@/lib/complexity/profile-input'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidateForEvent } from '@/lib/ai/prompt-cache'

export { profileToComplexityInput } from '@/lib/complexity/profile-input'

export type ComplexityTriggerSource =
  | 'onboarding_complete'
  | 'weekly_checkin'
  | 'profile_edit_client'
  | 'profile_edit_coach'
  | 'profile_edit_admin'
  | 'manual'

export type ComplexityRecalculateResult = {
  clientId: string
  rawScore: number
  displayScore: number
  tier: 'low' | 'medium' | 'high'
  previousDisplayScore: number | null
  previousTier: 'low' | 'medium' | 'high' | null
  scoreChange: number | null
  historyId: string
  reasoning: string[]
  skipped: boolean
}

async function fetchLatestCheckin(
  supabase: SupabaseClient,
  clientId: string,
  checkinId?: string | null
): Promise<Checkin | null> {
  if (checkinId) {
    const { data } = await supabase.from('checkins').select('*').eq('id', checkinId).maybeSingle()
    return (data as Checkin | null) ?? null
  }

  const { data } = await supabase
    .from('checkins')
    .select('*')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as Checkin | null) ?? null
}

function buildHistoryPayload(
  clientId: string,
  result: ComplexityScoreResult,
  previous: {
    rawScore: number | null
    displayScore: number | null
    tier: 'low' | 'medium' | 'high' | null
  },
  trigger: ComplexityTriggerSource,
  checkinId?: string | null
) {
  const displayScore = toDisplayScore(result.score)
  const tier = toStoredTier(result.tier)
  const scoreChange =
    previous.displayScore === null ? null : displayScore - previous.displayScore

  return {
    clientId,
    rawScore: result.score,
    displayScore,
    tier,
    previousRawScore: previous.rawScore,
    previousDisplayScore: previous.displayScore,
    previousTier: previous.tier,
    scoreChange,
    trigger,
    reasoning: result.reasoning,
    checkinId: checkinId ?? null,
  }
}

/**
 * Calculate and persist complexity score for a client.
 * Pure calculation — no AI calls. Creates immutable history record.
 */
export async function recalculateClientComplexity(
  supabase: SupabaseClient,
  clientId: string,
  options: {
    trigger: ComplexityTriggerSource
    checkinId?: string | null
    /** When false, skips if profile is not onboarding-complete. */
    requireOnboardingComplete?: boolean
  }
): Promise<ComplexityRecalculateResult | null> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  if (profileError || !profile) return null

  const row = profile as OnboardingProfile & {
    complexity_score?: number | null
    complexity_raw_score?: number | null
    complexity_tier?: 'low' | 'medium' | 'high' | null
    complexity_previous_score?: number | null
    complexity_previous_tier?: 'low' | 'medium' | 'high' | null
  }

  if (options.requireOnboardingComplete !== false && !row.onboarding_complete) {
    return null
  }

  const latestCheckin = await fetchLatestCheckin(supabase, clientId, options.checkinId)
  const result = calculateComplexityScore(profileToComplexityInput(row, latestCheckin))

  const previous = {
    rawScore: row.complexity_raw_score ?? null,
    displayScore: row.complexity_score ?? null,
    tier: row.complexity_tier ?? null,
  }

  const payload = buildHistoryPayload(clientId, result, previous, options.trigger, options.checkinId)
  const now = new Date().toISOString()

  const { data: history, error: historyError } = await supabase
    .from('complexity_score_history')
    .insert({
      client_id: clientId,
      raw_score: payload.rawScore,
      display_score: payload.displayScore,
      tier: payload.tier,
      previous_raw_score: payload.previousRawScore,
      previous_display_score: payload.previousDisplayScore,
      previous_tier: payload.previousTier,
      score_change: payload.scoreChange,
      trigger_source: payload.trigger,
      reasoning: payload.reasoning,
      checkin_id: payload.checkinId,
      created_at: now,
    })
    .select('id')
    .single()

  if (historyError || !history) {
    throw new Error(historyError?.message ?? 'Failed to save complexity history.')
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      complexity_score: payload.displayScore,
      complexity_raw_score: payload.rawScore,
      complexity_tier: payload.tier,
      complexity_last_calculated_at: now,
      complexity_previous_score: payload.previousDisplayScore,
      complexity_previous_tier: payload.previousTier,
      complexity_score_change: payload.scoreChange,
      updated_at: now,
    })
    .eq('id', clientId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  invalidateForEvent('complexity_recalculated', clientId)

  return {
    clientId,
    rawScore: payload.rawScore,
    displayScore: payload.displayScore,
    tier: payload.tier,
    previousDisplayScore: payload.previousDisplayScore,
    previousTier: payload.previousTier,
    scoreChange: payload.scoreChange,
    historyId: history.id as string,
    reasoning: payload.reasoning,
    skipped: false,
  }
}

/** Server-side helper using service role (for API routes and scripts). */
export async function recalculateClientComplexityAdmin(
  clientId: string,
  options: Parameters<typeof recalculateClientComplexity>[2]
): Promise<ComplexityRecalculateResult | null> {
  return recalculateClientComplexity(createAdminClient(), clientId, options)
}
