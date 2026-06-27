import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const ref = 'zhcedsmvpvpaqezbdiiy'
const password = process.env.SUPABASE_DB_PASSWORD
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD in .env.local (Supabase → Settings → Database)')
  process.exit(1)
}

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

const dir = join('supabase', 'migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

console.log('Applying migrations:', files.join(', '))

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8')
  console.log(`\n--- ${file} ---`)
  try {
    await client.query(sql)
    console.log('OK')
  } catch (err) {
    console.error('FAILED:', err.message)
    await client.end()
    process.exit(1)
  }
}

await client.end()
console.log('\nAll migrations applied.')
