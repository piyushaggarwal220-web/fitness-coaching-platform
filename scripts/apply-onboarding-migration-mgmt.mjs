import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const ref = 'zhcedsmvpvpaqezbdiiy'
const sql = readFileSync('supabase/migrations/20260619600000_add_onboarding_data.sql', 'utf8')

let token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
if (!token) {
  try {
    token = readFileSync(join(process.env.USERPROFILE, '.supabase', 'access-token'), 'utf8').trim()
  } catch {
    // no token file
  }
}

if (!token) {
  console.error('FAIL: No SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token')
  process.exit(1)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

const body = await res.text()
if (!res.ok) {
  console.error('FAIL:', res.status, body)
  process.exit(1)
}

const verifyRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'onboarding_data'`,
  }),
})

const verifyBody = await verifyRes.json()
if (!verifyRes.ok) {
  console.error('FAIL verify:', verifyBody)
  process.exit(1)
}

const rows = verifyBody?.result ?? verifyBody
console.log('PASS: Migration applied via Management API')
console.log('Column check:', JSON.stringify(rows))

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { error } = await sb.from('profiles').select('onboarding_data').limit(0)
console.log(error ? `FAIL service-role probe: ${error.message}` : 'PASS: service-role can select onboarding_data')
