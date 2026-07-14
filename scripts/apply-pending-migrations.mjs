import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_FILES = [
  'supabase/migrations/20260708100000_add_home_workout_prompt_categories.sql',
  'supabase/migrations/20260708110000_seed_ai_knowledge.sql',
  'supabase/migrations/20260708200000_complexity_score_system.sql',
  'supabase/migrations/20260712100000_recurring_checkin_system.sql',
  'supabase/migrations/20260713100000_premium_polish_chat_fixes.sql',
  'supabase/migrations/20260714120000_create_daily_tracker.sql',
]

function loadEnvLocal() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

async function tryManagementApi(ref, token) {
  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(file, 'utf8')
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
      console.error(`FAIL ${file}: HTTP ${res.status} ${body}`)
      return false
    }
    console.log(`OK: ${file}`)
  }
  return true
}

async function tryPgConnection(connectionString) {
  const pg = await import('pg')
  const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    for (const file of MIGRATION_FILES) {
      await client.query(readFileSync(file, 'utf8'))
      console.log(`OK: ${file}`)
    }
    return true
  } finally {
    await client.end()
  }
}

async function verifyCheckinSchema(admin) {
  const { error: checkinError } = await admin
    .from('checkins')
    .select('checkin_type, coaching_week, coaching_day, due_date, plan_version')
    .limit(0)
  if (checkinError) return false

  const { error: journeyError } = await admin
    .from('journey_entries')
    .select('id, client_id, checkin_id, entry_date, plan_version')
    .limit(0)
  if (journeyError) return false

  const { error: trackerError } = await admin.from('daily_tracker_days').select('id').limit(0)
  return !trackerError
}

async function main() {
  loadEnvLocal()

  const ref = process.env.SUPABASE_PROJECT_REF?.trim() || 'zhcedsmvpvpaqezbdiiy'

  let token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!token) {
    try {
      token = readFileSync(join(process.env.USERPROFILE ?? '', '.supabase', 'access-token'), 'utf8').trim()
    } catch {
      // no token file
    }
  }

  if (token) {
    const ok = await tryManagementApi(ref, token)
    process.exit(ok ? 0 : 1)
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  if (password) {
    const connectionString =
      process.env.DATABASE_URL ??
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
    try {
      const ok = await tryPgConnection(connectionString)
      process.exit(ok ? 0 : 1)
    } catch (err) {
      console.error('FAIL pg:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('FAIL: Cannot apply migrations automatically.')
    console.error('Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD in .env.local, or run SQL in Supabase dashboard:')
    for (const file of MIGRATION_FILES) console.error(`  ${file}`)
    process.exit(1)
  }

  const admin = createClient(url, key)
  const schemaReady = await verifyCheckinSchema(admin)
  if (schemaReady) {
    console.log('SKIP: pending migrations appear already applied (checkin + journey schema present).')
    process.exit(0)
  }

  console.error('FAIL: Cannot apply migrations automatically without SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD.')
  for (const file of MIGRATION_FILES) console.error(`  ${file}`)
  process.exit(1)
}

void main()
