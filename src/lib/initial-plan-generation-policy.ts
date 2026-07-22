import { hasAuthoritativeOnboardingCompletion } from '@/lib/plans'
import { validateOnboardingAnswersForProfile } from '@/lib/onboarding'
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
  options?: { termsAccepted?: boolean; requireCoach?: boolean }
): string | null {
  if (options?.requireCoach !== false && !profile.coach_id) {
    return 'A coach must be assigned before generation.'
  }
  return validateOnboardingAnswersForProfile(profile, {
    termsAccepted: options?.termsAccepted ?? Boolean(profile.terms_accepted_at),
  })
}

export function validateAuthoritativeOnboarding(profile: OnboardingProfile): string | null {
  if (!hasAuthoritativeOnboardingCompletion(profile)) {
    return 'Onboarding is not complete.'
  }
  return validatePersistedOnboardingAnswers(profile, {
    termsAccepted: Boolean(profile.terms_accepted_at),
  })
}
