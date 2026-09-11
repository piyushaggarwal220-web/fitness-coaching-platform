import assert from 'node:assert/strict'
import {
  PUBLIC_DEMO_CLIENT_EMAIL,
  PUBLIC_DEMO_CLIENT_NAME,
  isPublicDemoEmail,
  normalizeEmail,
} from '../src/lib/public-demo'
import { isTrialClientHiddenFromCoaches } from '../src/lib/coach-roster-visibility'

assert.equal(PUBLIC_DEMO_CLIENT_EMAIL, 'public-demo@trial.test.local')
assert.equal(PUBLIC_DEMO_CLIENT_NAME, 'Demo Client')
assert.equal(isPublicDemoEmail('  Public-Demo@trial.test.local '), true)
assert.equal(isPublicDemoEmail('client@test.local'), false)
assert.equal(isPublicDemoEmail('paying@example.com'), false)
assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com')
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: PUBLIC_DEMO_CLIENT_EMAIL,
    access_source: 'admin_trial',
  }),
  true
)

console.log('✓ public demo email is view-only and hidden from coach rosters')
