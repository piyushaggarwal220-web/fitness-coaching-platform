/**
 * Remove all admin/super_admin accounts and create a fresh super_admin.
 * Run: node --env-file=.env.local scripts/reset-admin-account.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function password(length = 18) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%'
  const bytes = randomBytes(length)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

const NEW_EMAIL = process.env.NEW_ADMIN_EMAIL?.trim() || 'admin@lurvox.in'
const NEW_NAME = process.env.NEW_ADMIN_NAME?.trim() || 'Lurvox Admin'
const NEW_PASSWORD = process.env.NEW_ADMIN_PASSWORD?.trim() || password()

const { data: admins, error: listError } = await admin
  .from('profiles')
  .select('id, email, role')
  .in('role', ['admin', 'super_admin'])

if (listError) {
  console.error(listError.message)
  process.exit(1)
}

const removed = []
for (const row of admins ?? []) {
  const { error: delAuth } = await admin.auth.admin.deleteUser(row.id)
  if (delAuth) {
    console.warn(`Auth delete failed for ${row.email}: ${delAuth.message}`)
    // Still try profile delete
  }
  await admin.from('profiles').delete().eq('id', row.id)
  removed.push({ id: row.id, email: row.email, role: row.role })
}

const existingId = await (async () => {
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', NEW_EMAIL)
    .maybeSingle()
  if (profile?.id) return profile.id

  let page = 1
  while (true) {
    const { data: listed, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const match = listed.users.find((u) => u.email?.toLowerCase() === NEW_EMAIL.toLowerCase())
    if (match) return match.id
    if (listed.users.length < 200) break
    page += 1
  }
  return null
})()

let userId = existingId
if (userId) {
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    email: NEW_EMAIL,
    password: NEW_PASSWORD,
    email_confirm: true,
    user_metadata: { name: NEW_NAME, role: 'super_admin' },
  })
  if (updateError) {
    console.error(updateError.message)
    process.exit(1)
  }
} else {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: NEW_EMAIL,
    password: NEW_PASSWORD,
    email_confirm: true,
    user_metadata: { name: NEW_NAME, role: 'super_admin' },
  })
  if (createError || !created.user) {
    console.error(createError?.message ?? 'Failed to create admin')
    process.exit(1)
  }
  userId = created.user.id
}

const now = new Date().toISOString()
const { error: profileError } = await admin.from('profiles').upsert({
  id: userId,
  email: NEW_EMAIL,
  name: NEW_NAME,
  role: 'super_admin',
  payment_confirmed: true,
  onboarding_complete: true,
  updated_at: now,
})

if (profileError) {
  console.error(profileError.message)
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      removed,
      email: NEW_EMAIL,
      password: NEW_PASSWORD,
      userId,
      role: 'super_admin',
      loginUrl: 'https://app.lurvox.in/admin/login',
    },
    null,
    2
  )
)
