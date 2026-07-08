import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const MIGRATION_FILES = [
  'supabase/migrations/20260708100000_add_home_workout_prompt_categories.sql',
  'supabase/migrations/20260708110000_seed_ai_knowledge.sql',
  'supabase/migrations/20260708200000_complexity_score_system.sql',
]

async function tryManagementApi(ref: string, token: string): Promise<boolean> {
  const { readFileSync } = await import('node:fs')
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

async function tryPgConnection(connectionString: string): Promise<boolean> {
  const pg = await import('pg')
  const { readFileSync } = await import('node:fs')
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

async function verifyHomeEnum(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from('prompt_library').select('id').eq('category', 'initial_workout_home').limit(1)
  if (error?.message?.includes('invalid input value for enum')) {
    return false
  }
  return true
}

async function main(): Promise<void> {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')

  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }

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

  const admin = createAdminClient()
  const enumReady = await verifyHomeEnum(admin)
  if (enumReady) {
    console.log('SKIP: migrations may already be applied (home enum accepts queries).')
    console.log('If home prompts still fail to import, run SQL manually:')
    for (const file of MIGRATION_FILES) console.log(`  - ${file}`)
    process.exit(0)
  }

  console.error('FAIL: Cannot apply migrations automatically.')
  console.error('Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD in .env.local, or run SQL in Supabase dashboard:')
  for (const file of MIGRATION_FILES) console.error(`  ${file}`)
  process.exit(1)
}

void main()
