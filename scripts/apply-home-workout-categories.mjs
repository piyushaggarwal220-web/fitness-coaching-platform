import { readFileSync } from 'node:fs'
import pg from 'pg'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const ref = 'zhcedsmvpvpaqezbdiiy'
const password = process.env.SUPABASE_DB_PASSWORD
if (!password) {
  console.error('FAIL: Missing SUPABASE_DB_PASSWORD in .env.local')
  process.exit(1)
}

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

const sql = readFileSync(
  'supabase/migrations/20260708100000_add_home_workout_prompt_categories.sql',
  'utf8'
)

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query(sql)

  const { rows } = await client.query(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'prompt_library_category'
      AND e.enumlabel IN ('initial_workout_home', 'weekly_workout_update_home')
    ORDER BY e.enumlabel
  `)

  if (rows.length < 2) {
    console.error('FAIL: home workout enum values missing after migration')
    process.exit(1)
  }

  console.log('PASS: Home workout prompt categories applied:', rows.map((r) => r.enumlabel).join(', '))
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await client.end()
}
