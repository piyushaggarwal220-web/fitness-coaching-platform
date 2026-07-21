import {
  formFromProfile,
  ONBOARDING_SCREEN_COUNT,
  validateOnboardingStep,
} from '@/lib/onboarding'
import { hasAuthoritativeOnboardingCompletion } from '@/lib/plans'
import type { OnboardingProfile } from '@/types/database'

export type InitialPlanGenerationStatus = 'queued' | 'generating' | 'ready' | 'failed'
export const INITIAL_GENERATION_CLAIM_STATUS: InitialPlanGenerationStatus = 'queued'
export const STALE_GENERATION_MS = 10 * 60 * 1000

export function shouldStartInitialGeneration(status: InitialPlanGenerationStatus): boolean {
  return status === INITIAL_GENERATION_CLAIM_STATUS
}

export function canRetryInitialGeneration(
  status: InitialPlanGenerationStatus,
  startedAt?: string | null,
  now = Date.now()
): boolean {
  if (status === 'failed') return true
  return status === 'generating' &&
    Boolean(startedAt) &&
    now - new Date(startedAt!).getTime() >= STALE_GENERATION_MS
}

export function validatePersistedOnboardingAnswers(
  profile: OnboardingProfile,
  options?: { termsAccepted?: boolean }
): string | null {
  if (!profile.coach_id) return 'A coach must be assigned before generation.'

  const form = formFromProfile(profile)
  if (options?.termsAccepted) form.terms_accepted = true
  const photoUrls = {
    front: profile.progress_photo_front ?? null,
    side: profile.progress_photo_side ?? null,
    back: profile.progress_photo_back ?? null,
  }
  const meals = (['breakfast', 'lunch', 'dinner', 'snacks'] as const).filter(
    (meal) => Boolean(form[`timing_${meal}`])
  )

  for (let step = 0; step < ONBOARDING_SCREEN_COUNT; step += 1) {
    const error = validateOnboardingStep(step, form, undefined, photoUrls, {
      mealsForTiming: meals,
      confirmedMeals: meals,
    })
    if (error) return error
  }
  return null
}

export function validateAuthoritativeOnboarding(profile: OnboardingProfile): string | null {
  if (!hasAuthoritativeOnboardingCompletion(profile)) {
    return 'Onboarding is not complete.'
  }
  return validatePersistedOnboardingAnswers(profile, {
    termsAccepted: Boolean(profile.terms_accepted_at),
  })
}
