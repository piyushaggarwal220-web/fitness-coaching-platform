import assert from 'node:assert/strict'
import {
  isOnboardingFormEffectivelyEmpty,
  resolveOnboardingRestoreStep,
  INITIAL_ONBOARDING_FORM,
  getOnboardingWizardSteps,
} from '../src/lib/onboarding'

const wizard = getOnboardingWizardSteps({ training_location: 'gym' })

// Corrupted draft step 0 must never beat a real resume step (camera remount race).
assert.equal(resolveOnboardingRestoreStep(21, 0, wizard), 21)
assert.equal(resolveOnboardingRestoreStep(14, 0, wizard), 14)

// Same-screen draft is fine (camera remount while still on photos).
assert.equal(resolveOnboardingRestoreStep(21, 21, wizard), 21)

// Draft ahead of incomplete resume must not skip required fields (e.g. biceps).
assert.equal(resolveOnboardingRestoreStep(1, 22, wizard), 1)
assert.equal(resolveOnboardingRestoreStep(1, 21, wizard), 1)

// Missing / invalid draft falls back to resume.
assert.equal(resolveOnboardingRestoreStep(8, null, wizard), 8)
assert.equal(resolveOnboardingRestoreStep(8, 99, wizard), 8)

assert.equal(isOnboardingFormEffectivelyEmpty(INITIAL_ONBOARDING_FORM), true)
assert.equal(
  isOnboardingFormEffectivelyEmpty({
    ...INITIAL_ONBOARDING_FORM,
    name: 'Satyam',
  }),
  false
)

console.log('✓ onboarding restore never prefers corrupted step-0 drafts')
