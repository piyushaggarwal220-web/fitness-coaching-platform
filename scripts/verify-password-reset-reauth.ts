/**
 * Verifies password-reset reauthentication helpers.
 * Run: npx tsx scripts/verify-password-reset-reauth.ts
 */
import assert from 'node:assert/strict'
import { sanitizeAuthPasswordError } from '../src/lib/auth-password-errors'
import {
  PASSWORD_RECOVERY_COOKIE,
  isPasswordReauthError,
  passwordReauthUserMessage,
} from '../src/lib/auth-password-reset'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.equal(isPasswordReauthError('Password update requires reauthentication'), true)
pass('detects Supabase reauthentication error')

assert.equal(isPasswordReauthError('Invalid login credentials'), false)
pass('ignores unrelated auth errors')

assert.match(passwordReauthUserMessage(false), /verification code/i)
pass('guides user to verification code')

assert.equal(
  sanitizeAuthPasswordError('Password update requires reauthentication'),
  passwordReauthUserMessage(false)
)
pass('sanitizeAuthPasswordError maps reauth errors')

assert.equal(PASSWORD_RECOVERY_COOKIE, 'lurvox_password_recovery')
pass('recovery cookie name is stable')

console.log('\nAll password-reset reauth checks passed.')
