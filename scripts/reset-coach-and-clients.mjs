/**
 * One-off: set production coach to Rakshit Mohla and wipe all clients.
 * Run: node --env-file=.env.local scripts/reset-coach-and-clients.mjs
 */
import { createClient } from '@supabase/supabase-js'

const COACH_EMAIL = 'rakshitmohla@gmail.com'
const COACH_PASSWORD = 'rakshitmohlaking'
const COACH_NAME = 'Rakshit Mohla'

const KEEP_EMAILS = new Set([
  COACH_EMAIL.toLowerCase(),
  'admin@test.local',
  'dev-admin@dev.local',
])

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

async function ensureCoach() {
  const users = await listAllUsers()
  let user = users.find((u) => u.email?.toLowerCase() === COACH_EMAIL)

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: COACH_EMAIL,
      password: COACH_PASSWORD,
      email_confirm: true,
      user_metadata: { name: COACH_NAME, role: 'coach' },
    })
    if (error || !data.user) throw new Error(error?.message ?? 'Failed to create coach auth user')
    user = data.user
    console.log('Created coach auth user', user.id)
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: COACH_PASSWORD,
      email_confirm: true,
      user_metadata: { name: COACH_NAME, role: 'coach' },
    })
    if (error) throw new Error(`Failed to update coach credentials: ${error.message}`)
    console.log('Updated coach auth user', user.id)
  }

  const now = new Date().toISOString()
  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    email: COACH_EMAIL,
    name: COACH_NAME,
    role: 'coach',
    payment_confirmed: true,
    onboarding_complete: true,
    coach_id: null,
    updated_at: now,
  })
  if (profileError) throw new Error(`Coach profile upsert failed: ${profileError.message}`)

  const { data: existingCoach } = await admin.from('coaches').select('id, user_id').limit(1).maybeSingle()

  if (existingCoach) {
    const { error } = await admin
      .from('coaches')
      .update({ user_id: user.id, name: COACH_NAME, hard_cap: 100 })
      .eq('id', existingCoach.id)
    if (error) throw new Error(`Coach row update failed: ${error.message}`)
    console.log('Updated coaches row', existingCoach.id)
  } else {
    const { data: inserted, error } = await admin
      .from('coaches')
      .insert({ user_id: user.id, name: COACH_NAME, hard_cap: 100 })
      .select('id')
      .single()
    if (error || !inserted) throw new Error(error?.message ?? 'Failed to insert coach')
    console.log('Inserted coaches row', inserted.id)
  }

  return user.id
}

async function wipeClients(coachUserId) {
  const { data: clients, error } = await admin
    .from('profiles')
    .select('id, email, role')
    .or('role.eq.client,role.is.null')

  if (error) throw new Error(`Failed to list clients: ${error.message}`)

  const clientIds = (clients ?? [])
    .filter((p) => p.id !== coachUserId)
    .map((p) => p.id)

  console.log(`Found ${clientIds.length} client profile(s) to remove`)

  // Clear coach assignments first (safety)
  await admin.from('profiles').update({ coach_id: null }).not('role', 'in', '("coach","admin","super_admin")')

  // Purchases (SET NULL on user_id — wipe rows entirely for fresh start)
  const { error: purchErr } = await admin.from('purchases').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (purchErr) console.warn('purchases wipe:', purchErr.message)
  else console.log('Deleted all purchases')

  // Support messages may not cascade from client delete if orphaned — wipe support tables
  const { data: supportReqs } = await admin.from('support_requests').select('id')
  const supportIds = (supportReqs ?? []).map((r) => r.id)
  if (supportIds.length) {
    await admin.from('support_messages').delete().in('request_id', supportIds)
    await admin.from('support_requests').delete().in('id', supportIds)
    console.log(`Deleted ${supportIds.length} support request(s)`)
  }

  // Conversation messages via conversations
  const { data: convos } = await admin.from('coach_conversations').select('id')
  const convoIds = (convos ?? []).map((c) => c.id)
  if (convoIds.length) {
    await admin.from('conversation_messages').delete().in('conversation_id', convoIds)
    await admin.from('coach_conversations').delete().in('id', convoIds)
    console.log(`Deleted ${convoIds.length} conversation(s)`)
  }

  // Files / audit leftovers that may block deletes
  if (clientIds.length) {
    await admin.from('files').delete().in('user_id', clientIds).then(() => {}).catch(() => {})
    // Try common column names
    await admin.from('files').delete().in('client_id', clientIds)
    await admin.from('ai_generation_logs').delete().in('client_id', clientIds)
    await admin.from('platform_notifications').delete().in('recipient_id', clientIds)
  }

  // Delete client profiles (CASCADE cleans most child tables)
  if (clientIds.length) {
    const { error: delErr } = await admin.from('profiles').delete().in('id', clientIds)
    if (delErr) throw new Error(`Failed deleting client profiles: ${delErr.message}`)
    console.log(`Deleted ${clientIds.length} client profiles`)
  }

  // Remove old coach profiles that are not Rakshit
  const { data: otherCoaches } = await admin
    .from('profiles')
    .select('id, email')
    .eq('role', 'coach')
    .neq('id', coachUserId)

  for (const row of otherCoaches ?? []) {
    const { error: e } = await admin.from('profiles').delete().eq('id', row.id)
    if (e) console.warn('Could not delete old coach profile', row.email, e.message)
    else console.log('Deleted old coach profile', row.email)
  }

  // Delete auth users except keep list
  const users = await listAllUsers()
  let deletedAuth = 0
  for (const u of users) {
    const email = (u.email ?? '').toLowerCase()
    if (KEEP_EMAILS.has(email)) continue
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(u.id)
    if (delAuthErr) console.warn('Auth delete failed', email, delAuthErr.message)
    else {
      deletedAuth += 1
      console.log('Deleted auth user', email)
    }
  }
  console.log(`Deleted ${deletedAuth} auth user(s)`)
}

async function verify() {
  const { data: coaches } = await admin.from('coaches').select('id, name, user_id')
  const { data: clients } = await admin.from('profiles').select('id, email, role').eq('role', 'client')
  const { count: purchaseCount } = await admin.from('purchases').select('id', { count: 'exact', head: true })
  const { data: coachProfile } = await admin
    .from('profiles')
    .select('id, email, name, role')
    .eq('email', COACH_EMAIL)
    .maybeSingle()

  console.log('\n=== VERIFY ===')
  console.log('coaches:', coaches)
  console.log('coach profile:', coachProfile)
  console.log('client count:', clients?.length ?? 0)
  console.log('purchase count:', purchaseCount ?? 0)
}

const coachId = await ensureCoach()
await wipeClients(coachId)
await verify()
console.log('\nDone. Coach login:', COACH_EMAIL)
