import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const ref = process.env.SUPABASE_PROJECT_REF?.trim() || 'zhcedsmvpvpaqezbdiiy'
const sql = readFileSync(
  'supabase/migrations/20260708000000_add_profile_access_source.sql',
  'utf8'
)

let token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
if (!token) {
  try {
    token = readFileSync(join(process.env.USERPROFILE, '.supabase', 'access-token'), 'utf8').trim()
  } catch {
    // no token file
  }
}

if (!token) {
  console.error('SKIP: No SUPABASE_ACCESS_TOKEN — apply migration manually in Supabase SQL editor.')
  process.exit(0)
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

console.log('OK: access_source migration applied')
