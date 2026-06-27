import { readFileSync } from 'node:fs'
import pg from 'pg'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const ref = 'zhcedsmvpvpaqezbdiiy'
const password = process.env.SUPABASE_DB_PASSWORD
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD in .env.local')
  process.exit(1)
}

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

const expected = [
  { table: 'purchases', policy: 'Users can read own purchases' },
  { table: 'checkins', policy: 'Clients can insert own checkins' },
  { table: 'checkins', policy: 'Clients can read own checkins' },
  { table: 'checkins', policy: 'Coaches can read assigned checkins' },
  { table: 'checkins', policy: 'Coaches can update assigned checkins' },
  { table: 'plans', policy: 'Clients can read own active plans' },
  { table: 'plans', policy: 'Coaches can read assigned client plans' },
  { table: 'plans', policy: 'Coaches can insert assigned client plans' },
  { table: 'plans', policy: 'Coaches can update assigned client plans' },
  { table: 'plans', policy: 'Coaches can delete assigned client plans' },
  { table: 'ai_knowledge', policy: 'Authenticated users can read active knowledge' },
]

console.log('=== RLS enabled ===')
const { rows: rlsRows } = await client.query(`
  SELECT c.relname AS table, c.relrowsecurity AS rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('purchases','checkins','plans','ai_knowledge')
  ORDER BY c.relname
`)
for (const row of rlsRows) {
  console.log(`${row.table}: RLS ${row.rls ? 'ON' : 'OFF'}`)
}

console.log('\n=== Policies ===')
const { rows: policyRows } = await client.query(`
  SELECT tablename, policyname, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname
`)
for (const row of policyRows) {
  console.log(`${row.tablename}.${row.policyname} (${row.cmd})`)
}

console.log('\n=== Expected policy check ===')
for (const exp of expected) {
  const found = policyRows.some((p) => p.tablename === exp.table && p.policyname === exp.policy)
  console.log(`${found ? 'OK' : 'MISSING'}: ${exp.table} → ${exp.policy}`)
}

console.log('\n=== Migration history ===')
try {
  const { rows: history } = await client.query(`
    SELECT version, name
    FROM supabase_migrations.schema_migrations
    ORDER BY version
  `)
  for (const row of history) {
    console.log(`${row.version} ${row.name ?? ''}`)
  }
} catch {
  console.log('(schema_migrations table not found — migrations may have been applied manually)')
}

await client.end()
