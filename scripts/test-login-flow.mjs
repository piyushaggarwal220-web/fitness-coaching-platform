import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const seedRes = await fetch('http://localhost:3000/api/dev/seed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'ensure_test_client' }),
})
const seedJson = await seedRes.json()
if (!seedRes.ok) {
  console.error('SEED: FAILED', seedJson.error ?? seedRes.status)
  process.exit(1)
}

const email = seedJson.data?.email
const password = seedJson.data?.password
if (!email || !password) {
  console.error('SEED: missing credentials in response')
  process.exit(1)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data, error } = await sb.auth.signInWithPassword({ email, password })
if (error) {
  console.error('LOGIN: FAILED', error.message)
  process.exit(1)
}

console.log('LOGIN: SUCCESS')
console.log(JSON.stringify({ userId: data.user?.id, email: data.user?.email }, null, 2))
