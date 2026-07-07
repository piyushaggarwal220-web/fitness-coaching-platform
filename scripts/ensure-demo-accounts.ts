/**
 * Ensures default demo accounts exist for internal QA and demos.
 * Run: npx tsx --env-file=.env.local scripts/ensure-demo-accounts.ts
 */
import {
  DEMO_ADMIN_EMAIL,
  DEMO_CLIENT_EMAIL,
  DEMO_COACH_EMAIL,
  ensureAllDemoAccounts,
} from '../src/lib/admin/testing-accounts'
import { getPortalLoginUrls } from '../src/lib/admin/portal-urls'

async function main(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required.')
    process.exit(1)
  }

  console.log('=== Ensuring Demo Accounts ===\n')

  const accounts = await ensureAllDemoAccounts()
  const urls = getPortalLoginUrls()

  for (const account of accounts) {
    console.log(account.message)
    if (account.created) {
      console.log(`  Email: ${account.email}`)
      console.log(`  Password: ${account.password}`)
      console.log(`  Role: ${account.role}`)
    } else {
      console.log(`  Email: ${account.email} (unchanged)`)
    }
    console.log(`  Login: ${account.loginUrl}`)
    console.log('')
  }

  console.log('=== Portal URLs ===\n')
  console.log(`Admin Login:\n${urls.admin}\n`)
  console.log(`Coach Login:\n${urls.coach}\n`)
  console.log(`Client Login:\n${urls.client}\n`)

  console.log('=== Expected Accounts ===')
  console.log(`  Admin:  ${DEMO_ADMIN_EMAIL}`)
  console.log(`  Coach:  ${DEMO_COACH_EMAIL}`)
  console.log(`  Client: ${DEMO_CLIENT_EMAIL}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
