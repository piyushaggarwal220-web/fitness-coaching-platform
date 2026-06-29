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

const sql = readFileSync('supabase/migrations/20260619600000_add_onboarding_data.sql', 'utf8')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query(sql)
  const { rows } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'onboarding_data'
  `)
  if (rows.length === 0) {
    console.error('FAIL: onboarding_data column not found after migration')
    process.exit(1)
  }
  console.log('PASS: Migration applied')
  console.log('Column:', rows[0])
} catch (err) {
  console.error('FAIL:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
