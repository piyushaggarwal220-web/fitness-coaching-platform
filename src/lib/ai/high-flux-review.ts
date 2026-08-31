import { resolveClientCalorieTargets } from '@/lib/ai/calorie-targets'
import {
  inferMacrosFromDietText,
  parseHeaderCalories,
} from '@/lib/ai/nutrition-macro-sync'
import { resolveDietFloorKcal } from '@/lib/ai/plan-quality-rules'
import type { OnboardingProfile } from '@/types/database'

export type HighFluxReviewFlag = {
  level: 'warning' | 'info'
  message: string
}


function parseStepTarget(text: string | null | undefined): number | null {
  if (!text?.trim()) return null
  let best: number | null = null
  const pattern = /\b(\d{1,2}[,.]?\d{0,3})\s*(?:k\s*)?steps?\b/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1]!.replace(/,/g, '')
    let value = parseInt(raw, 10)
    if (!Number.isFinite(value)) continue
    if (/k\s*steps?/i.test(match[0]) && value < 100) value *= 1000
    if (value >= 2000 && value <= 25000) {
      best = best == null ? value : Math.max(best, value)
    }
  }
  return best
}

function cardioLooksMinimal(text: string | null | undefined): boolean {
  const t = text?.trim() ?? ''
  if (!t) return true
  if (t.length < 80) return true
  return !/(walk|steps|liss|cardio|zone|min|minute|km)/i.test(t)
}

/** Coach-facing checks: high flux = higher food AND higher output together. */
export function evaluateHighFluxPlanReview(input: {
  profile: Pick<
    OnboardingProfile,
    'weight' | 'fitness_goal' | 'onboarding_data' | 'sleep_duration' | 'training_experience' | 'injuries'
  >
  nutritionPlan: string | null | undefined
  cardioPlan: string | null | undefined
  workoutPlan?: string | null
}): HighFluxReviewFlag[] {
  const flags: HighFluxReviewFlag[] = []
  const headerCalories = parseHeaderCalories(input.nutritionPlan)
  const foodMacros = input.nutritionPlan?.trim()
    ? inferMacrosFromDietText(input.nutritionPlan)
    : null
  const calories = foodMacros?.calories ?? headerCalories
  const targets = resolveClientCalorieTargets(input.profile as OnboardingProfile)
  const floor = targets?.floorKcal ?? resolveDietFloorKcal(input.profile.weight)

  if (
    headerCalories != null &&
    foodMacros != null &&
    foodMacros.calories > 0 &&
    Math.abs(headerCalories - foodMacros.calories) > 40
  ) {
    flags.push({
      level: 'warning',
      message:
        'Header calories do not match what the meal portions sum to. Regenerate — honest food math only; header and daily totals must agree.',
    })
  }

  if (calories != null) {
    const looksLight =
      calories <= floor + 80 || (targets != null && calories < targets.min)

    if (looksLight) {
      flags.push({
        level: 'warning',
        message:
          'Portions look light for this client\'s size, training load, and goal. Regenerate with more generous maintenance-level food before delivering — active lifters should not get crash-diet templates.',
      })
    }
  }

  const stepTarget = parseStepTarget(
    [input.cardioPlan, input.workoutPlan, input.nutritionPlan].filter(Boolean).join('\n')
  )
  const habitSteps = parseInt(String(input.profile.onboarding_data?.lifestyle?.dailySteps ?? ''), 10)
  const baselineSteps = Number.isFinite(habitSteps) && habitSteps > 0 ? habitSteps : 6000
  const minSteps = baselineSteps + 2500

  if (cardioLooksMinimal(input.cardioPlan)) {
    flags.push({
      level: 'warning',
      message:
        'Cardio / steps section looks empty or thin. High flux requires a clear daily step target and walking/LISS — raise output, not just food cuts.',
    })
  } else if (stepTarget != null && stepTarget < minSteps) {
    flags.push({
      level: 'warning',
      message: `Step target (~${stepTarget.toLocaleString()}) may be low for high flux. Aim for at least ~${minSteps.toLocaleString()} (habit + 2.5k) when food stays high.`,
    })
  } else if (stepTarget == null) {
    flags.push({
      level: 'info',
      message: `Add an explicit daily step target (e.g. ${minSteps.toLocaleString()}+) in cardio or workout notes so food and output stay paired.`,
    })
  }

  if (calories != null && calories >= floor + 100 && cardioLooksMinimal(input.cardioPlan)) {
    flags.push({
      level: 'warning',
      message: 'Food is reasonable but output plan is missing — high flux needs both sides up.',
    })
  }

  return flags
}
