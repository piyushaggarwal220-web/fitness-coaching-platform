import type { SupabaseClient } from '@supabase/supabase-js'
import { parseHeaderCalories } from '@/lib/ai/nutrition-macro-sync'

const NOTICE_MIN_KCAL = 50

export function dietCalorieShiftNotice(input: {
  previousNutrition: string | null | undefined
  nextNutrition: string | null | undefined
  reason: 'plan_edit' | 'checkin' | 'publish'
}): string | null {
  const before = parseHeaderCalories(input.previousNutrition)
  const after = parseHeaderCalories(input.nextNutrition)
  if (before == null || after == null) return null
  if (Math.abs(after - before) < NOTICE_MIN_KCAL) return null
  const because =
    input.reason === 'plan_edit'
      ? 'the plan edit you locked in'
      : input.reason === 'checkin'
        ? 'your latest check-in'
        : 'the plan that was just published'
  return `Your diet target moved from ${before} kcal to ${after} kcal because of ${because}. The tracker follows this published plan.`
}

export async function notifyDietCalorieShift(
  supabase: SupabaseClient,
  input: {
    clientId: string
    previousNutrition: string | null | undefined
    nextNutrition: string | null | undefined
    reason: 'plan_edit' | 'checkin' | 'publish'
  }
): Promise<void> {
  const content = dietCalorieShiftNotice(input)
  if (!content) return
  const { error } = await supabase.from('ai_coach_messages').insert({
    client_id: input.clientId,
    role: 'assistant',
    content,
    created_at: new Date().toISOString(),
  })
  if (error) console.error('[plan] calorie notice failed', error.message)
}
