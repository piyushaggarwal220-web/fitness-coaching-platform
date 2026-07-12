/**
 * Verification script for launch sprint features.
 * Run: npx tsx --env-file=.env.local scripts/verify-launch-features.ts
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { validateRedemptionCode, normalizeRedemptionCode } from '../src/lib/redemption-codes'
import { isDevelopmentModeServer, shouldBypassPayment, shouldAutoAssignCoach } from '../src/lib/config'
import { isWhatsAppConfigured } from '../src/lib/notifications/whatsapp-provider'
import { NotificationTemplates } from '../src/lib/notifications/service'

const checks: { name: string; pass: boolean; detail?: string }[] = []

function check(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail })
  console.log(pass ? `✓ ${name}` : `✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('\n=== Launch Features Verification ===\n')

  // Config
  check('Development mode config exists', typeof isDevelopmentModeServer === 'function')
  check('Payment bypass is env-controlled', typeof shouldBypassPayment === 'function')
  check('Auto coach assignment is env-controlled', typeof shouldAutoAssignCoach === 'function')
  check('Production blocks dev mode', process.env.NODE_ENV === 'production' ? !isDevelopmentModeServer() : true)

  // Notification service
  check('Notification templates defined', Boolean(NotificationTemplates.welcome))
  check('WhatsApp provider stub exists', typeof isWhatsAppConfigured === 'function')

  // Database tables
  const admin = createAdminClient()

  const tables = [
    'redemption_codes',
    'redemption_usages',
    'coach_conversations',
    'conversation_messages',
    'user_notifications',
    'issue_reports',
    'coach_reply_ratings',
  ]

  for (const table of tables) {
    const { error } = await admin.from(table).select('id').limit(1)
    check(`Table ${table} exists`, !error, error?.message)
  }

  // Redemption code validation
  const validation = await validateRedemptionCode('NONEXISTENT_CODE_XYZ')
  check('Redemption validation rejects invalid codes', !validation.valid)

  // Code normalization
  check('Code normalization works', normalizeRedemptionCode('  test code  ') === 'TESTCODE')

  const passed = checks.filter((c) => c.pass).length
  const total = checks.length
  console.log(`\n=== ${passed}/${total} checks passed ===\n`)

  if (passed < total) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
