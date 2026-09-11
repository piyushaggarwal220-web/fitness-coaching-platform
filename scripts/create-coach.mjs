/**
 * Create or update a coach account (auth + profile + coaches row).
 * Run: node --env-file=.env.local scripts/create-coach.mjs
 *
 * Optional env:
 *   COACH_EMAIL, COACH_NAME, COACH_PASSWORD, COACH_HARD_CAP
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const COACH_EMAIL = (process.env.COACH_EMAIL ?? 'piyushfitness44@gmail.com').trim().toLowerCase()
const COACH_NAME = (process.env.COACH_NAME ?? 'Piyush Aggarwal').trim()
const COACH_PASSWORD =
  process.env.COACH_PASSWORD?.trim() ||
  `Lurvox-${randomBytes(4).toString('hex')}-${randomBytes(2).toString('hex')}!`
const COACH_HARD_CAP = Number(process.env.COACH_HARD_CAP ?? 100)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAllUsers() {
  const users = []
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    users.push(...(data?.users ?? []))
    if (!data?.users?.length || data.users.length < 200) break
    page += 1
  }
  return users
}

async function main() {
  const users = await listAllUsers()
  let user = users.find((u) => u.email?.toLowerCase() === COACH_EMAIL)

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: COACH_EMAIL,
      password: COACH_PASSWORD,
      email_confirm: true,
      user_metadata: { name: COACH_NAME, role: 'coach' },
    })
    if (error || !data.user) throw new Error(error?.message ?? 'Failed to create auth user')
    user = data.user
    console.log('Created auth user:', user.id)
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: COACH_PASSWORD,
      email_confirm: true,
      user_metadata: { name: COACH_NAME, role: 'coach' },
    })
    if (error) throw new Error(`Failed to update auth user: ${error.message}`)
    console.log('Updated auth user:', user.id)
  }

  const now = new Date().toISOString()
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: COACH_EMAIL,
      name: COACH_NAME,
      role: 'coach',
      payment_confirmed: true,
      onboarding_complete: true,
      coach_id: null,
      updated_at: now,
    },
    { onConflict: 'id' }
  )
  if (profileError) throw new Error(`Profile upsert failed: ${profileError.message}`)

  const { data: existingCoach } = await admin
    .from('coaches')
    .select('id, user_id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingCoach) {
    const { error } = await admin
      .from('coaches')
      .update({ name: COACH_NAME, hard_cap: COACH_HARD_CAP })
      .eq('id', existingCoach.id)
    if (error) throw new Error(`Coach row update failed: ${error.message}`)
    console.log('Updated coaches row:', existingCoach.id)
  } else {
    const { data: inserted, error } = await admin
      .from('coaches')
      .insert({ user_id: user.id, name: COACH_NAME, hard_cap: COACH_HARD_CAP })
      .select('id')
      .single()
    if (error || !inserted) throw new Error(error?.message ?? 'Failed to insert coaches row')
    console.log('Inserted coaches row:', inserted.id)
  }

  console.log('\nCoach ready')
  console.log('  Name:    ', COACH_NAME)
  console.log('  Email:   ', COACH_EMAIL)
  console.log('  Password:', COACH_PASSWORD)
  console.log('  Login:   ', `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.lurvox.in'}/coach/login`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
