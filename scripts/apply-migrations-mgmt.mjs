import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const ref = 'zhcedsmvpvpaqezbdiiy'
let token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
if (!token) {
  try {
    token = readFileSync(join(process.env.USERPROFILE, '.supabase', 'access-token'), 'utf8').trim()
  } catch {
    // not in fallback file
  }
}

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Run: npx supabase login')
  process.exit(1)
}

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return body
}

const dir = join('supabase', 'migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

console.log('Applying via Management API:', files.join(', '))

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8')
  console.log(`\n--- ${file} ---`)
  try {
    const result = await runQuery(sql)
    console.log('OK', result.slice(0, 120))
  } catch (err) {
    console.error('FAILED:', err.message)
    process.exit(1)
  }
}

console.log('\nAll migrations applied.')
