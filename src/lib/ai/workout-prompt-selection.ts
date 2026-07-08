import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import type { OnboardingProfile, PromptLibraryCategory } from '@/types/database'

/** Workout programming environment derived from client onboarding. */
export type WorkoutEnvironment = 'gym' | 'home'

const WORKOUT_ACTIONS = new Set<CoachAiActionId>(['initial_workout', 'review_update_workout'])

export const GYM_WORKOUT_PROMPT_CATEGORIES = {
  initial: 'initial_workout',
  weekly: 'weekly_workout_update',
} as const satisfies Record<'initial' | 'weekly', PromptLibraryCategory>

export const HOME_WORKOUT_PROMPT_CATEGORIES = {
  initial: 'initial_workout_home',
  weekly: 'weekly_workout_update_home',
} as const satisfies Record<'initial' | 'weekly', PromptLibraryCategory>

export function isWorkoutCoachAction(actionId: CoachAiActionId): boolean {
  return WORKOUT_ACTIONS.has(actionId)
}

/**
 * Resolve gym vs home workout environment from onboarding.
 * Home + equipment and home + bodyweight both map to home (one prompt handles equipment decisions).
 */
export function resolveWorkoutEnvironment(
  profile: Pick<OnboardingProfile, 'onboarding_data'>
): WorkoutEnvironment {
  const location = profile.onboarding_data?.training?.location?.trim().toLowerCase()

  if (location === 'home') return 'home'
  // gym, both, or unknown → gym (preserves existing gym behaviour)
  return 'gym'
}

export function resolveWorkoutPromptCategory(
  actionId: 'initial_workout' | 'review_update_workout',
  environment: WorkoutEnvironment
): PromptLibraryCategory {
  if (actionId === 'initial_workout') {
    return environment === 'home'
      ? HOME_WORKOUT_PROMPT_CATEGORIES.initial
      : GYM_WORKOUT_PROMPT_CATEGORIES.initial
  }

  return environment === 'home'
    ? HOME_WORKOUT_PROMPT_CATEGORIES.weekly
    : GYM_WORKOUT_PROMPT_CATEGORIES.weekly
}

export function isHomeWorkoutPromptCategory(category: PromptLibraryCategory): boolean {
  return (
    category === HOME_WORKOUT_PROMPT_CATEGORIES.initial ||
    category === HOME_WORKOUT_PROMPT_CATEGORIES.weekly
  )
}

/** Prompt Library category for a coach action, accounting for workout environment. */
export function getPromptCategoryForAction(
  actionId: CoachAiActionId,
  profile?: OnboardingProfile | null
): PromptLibraryCategory {
  if (actionId === 'initial_workout' || actionId === 'review_update_workout') {
    const environment = resolveWorkoutEnvironment(profile ?? {})
    return resolveWorkoutPromptCategory(actionId, environment)
  }

  const staticMap: Record<
    Exclude<CoachAiActionId, 'initial_workout' | 'review_update_workout'>,
    PromptLibraryCategory
  > = {
    initial_diet: 'initial_diet',
    review_update_diet: 'weekly_diet_update',
  }

  return staticMap[actionId as Exclude<CoachAiActionId, 'initial_workout' | 'review_update_workout'>]
}
