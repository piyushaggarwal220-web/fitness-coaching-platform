import { createClient } from '@supabase/supabase-js'
import { DEFAULT_COACH_HARD_CAP } from '../src/lib/coach-capacity'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url?.startsWith('http') || !key) {
    throw new Error('Missing production Supabase env (url/key)')
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: before, error: beforeErr } = await admin
    .from('coaches')
    .select('id, name, hard_cap')
    .order('name')
  if (beforeErr) throw beforeErr

  console.log(
    'Before:',
    (before ?? []).map((c) => ({ name: c.name, hard_cap: c.hard_cap }))
  )

  const ids = (before ?? [])
    .filter((c) => c.hard_cap == null || c.hard_cap < DEFAULT_COACH_HARD_CAP)
    .map((c) => c.id)

  console.log(`Raising ${ids.length} coach(es) to ${DEFAULT_COACH_HARD_CAP}`)

  if (ids.length > 0) {
    const { error } = await admin
      .from('coaches')
      .update({ hard_cap: DEFAULT_COACH_HARD_CAP })
      .in('id', ids)
    if (error) throw error
  }

  const { data: after, error: afterErr } = await admin
    .from('coaches')
    .select('id, name, hard_cap')
    .order('name')
  if (afterErr) throw afterErr

  console.log(
    'After:',
    (after ?? []).map((c) => ({ name: c.name, hard_cap: c.hard_cap }))
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
