/**
 * Verifies generatePlan provider-retry helpers and failure message truncation.
 * Run: npx tsx scripts/verify-generate-plan-retries.ts
 */
import assert from 'node:assert/strict'
import { ClaudeResponseError } from '../src/lib/ai/anthropic'
import {
  formatGeneratePlanFailure,
  shouldRetryProviderError,
} from '../src/lib/ai/generate-plan'
import { isOpenAiBillingError } from '../src/lib/ai/openai-quota'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

const transient = new ClaudeResponseError('Overloaded', {
  status: 529,
  type: 'overloaded_error',
  category: 'transient',
  retryable: true,
})
assert.equal(shouldRetryProviderError(transient, 0, 3), true)
pass('retries transient provider errors when attempts remain')

assert.equal(shouldRetryProviderError(transient, 2, 3), false)
pass('does not retry transient errors on final attempt')

const permanent = new ClaudeResponseError('Bad request', {
  status: 400,
  category: 'request',
  retryable: false,
})
assert.equal(shouldRetryProviderError(permanent, 0, 3), false)
pass('does not retry non-retryable provider errors')

const billing = new ClaudeResponseError(
  'You have no credits remaining. Please check your plan and billing details.',
  { status: 429, type: 'insufficient_quota', category: 'quota', retryable: true }
)
assert.equal(isOpenAiBillingError(billing.message), true)
assert.equal(shouldRetryProviderError(billing, 0, 5), false)
pass('does not retry an OpenAI billing failure even when the provider marked it retryable')

assert.equal(isOpenAiBillingError('Rate limit reached for requests'), false)
assert.equal(
  shouldRetryProviderError(
    new ClaudeResponseError('Rate limit reached for requests', {
      status: 429,
      category: 'quota',
      retryable: true,
    }),
    0,
    3
  ),
  true
)
pass('still retries a rate limit')

const huge = 'x'.repeat(2000)
const formatted = formatGeneratePlanFailure('Anthropic', 'Invalid plan JSON.', huge, 500)
assert.ok(formatted.includes('Invalid plan JSON.'))
assert.ok(formatted.includes('Raw response preview:'))
assert.ok(formatted.length < 800)
assert.ok(formatted.endsWith('…'))
pass('truncates huge raw responses in failure messages')

const short = formatGeneratePlanFailure('Mock provider', 'Empty response.', 'ok', 500)
assert.ok(short.includes('Raw response preview: ok'))
assert.ok(!short.endsWith('…'))
pass('keeps short raw responses intact')

console.log('\nAll generate-plan retry checks passed.')
