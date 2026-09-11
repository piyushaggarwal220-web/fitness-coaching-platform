/**
 * Create / refresh the public view-only demo client used by /try.
 *
 *   npx tsx --env-file=.env.local.txt scripts/ensure-public-demo-client.ts
 *
 * Put the printed password in Vercel as PUBLIC_DEMO_CLIENT_PASSWORD.
 */
import { ensurePublicDemoClient } from '../src/lib/admin/testing-accounts'
import { PUBLIC_DEMO_CLIENT_EMAIL, PUBLIC_DEMO_CLIENT_NAME } from '../src/lib/public-demo'

async function main(): Promise<void> {
  const password = process.env.PUBLIC_DEMO_CLIENT_PASSWORD?.trim()
  const account = await ensurePublicDemoClient(password)

  console.log('Public demo client ready')
  console.log(`  email:    ${PUBLIC_DEMO_CLIENT_EMAIL}`)
  console.log(`  name:     ${PUBLIC_DEMO_CLIENT_NAME}`)
  console.log(`  created:  ${account.created}`)
  console.log(`  login:    ${account.loginUrl}`)
  console.log(`  message:  ${account.message}`)
  if (!password) {
    console.log('  password: generated — add PUBLIC_DEMO_CLIENT_PASSWORD in Vercel (printed once below)')
    console.log(account.password)
  } else {
    console.log('  password: using PUBLIC_DEMO_CLIENT_PASSWORD from env')
  }
}

void main()
