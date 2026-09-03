/**
 * Offline checks for session cache helpers used after login / onboarding.
 * Run: npx tsx scripts/verify-session-cache.ts
 */
import assert from 'node:assert/strict'
import {
  invalidateSessionCache,
  isAuthNetworkError,
  seedAuthenticatedClientSession,
  isOnboardingComplete,
} from '../src/lib/session-restore'
import type { OnboardingProfile } from '../src/types/database'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

const profile = {
  id: 'user-1',
  email: 'client@example.com',
  onboarding_complete: true,
  onboarding_completed_at: '2026-08-01T00:00:00.000Z',
  role: 'client',
} as OnboardingProfile

assert.equal(typeof invalidateSessionCache, 'function')
pass('invalidateSessionCache is exported')

assert.equal(typeof seedAuthenticatedClientSession, 'function')
pass('seedAuthenticatedClientSession is exported')

invalidateSessionCache()
seedAuthenticatedClientSession({ id: 'user-1', email: 'client@example.com' }, profile)
assert.equal(isOnboardingComplete(profile), true)
pass('seeded profile reports onboarding complete')

invalidateSessionCache()
pass('invalidateSessionCache clears without throwing')

assert.equal(isAuthNetworkError('Failed to fetch'), true)
assert.equal(isAuthNetworkError({ name: 'AuthRetryableFetchError', message: 'Load failed' }), true)
assert.equal(isAuthNetworkError('Invalid login credentials'), false)
pass('network auth errors are distinguished from credential errors')

// Calling again after clear must stay safe for logout / login handoff.
invalidateSessionCache()
seedAuthenticatedClientSession({ id: 'user-2', email: 'other@example.com' }, {
  ...profile,
  id: 'user-2',
  email: 'other@example.com',
})
invalidateSessionCache()
pass('login → seed → logout cycle is safe')

console.log('\nAll session cache checks passed.')
