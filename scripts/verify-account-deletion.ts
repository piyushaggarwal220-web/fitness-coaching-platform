/**
 * Verify super-admin account deletion: client + coach flows.
 * Run: npx tsx --env-file=.env.local scripts/verify-account-deletion.ts
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { deleteClientAccount, deleteCoachAccount } from '../src/lib/admin/account-deletion'

function pass(label: string) {
  console.log(`PASS ${label}`)
}
function fail(label: string, detail: string) {
  console.error(`FAIL ${label}: ${detail}`)
  process.exit(1)
}

async function createClientWithData(email: string) {
  const admin = createAdminClient()
  const password = 'Test12345!'

  // Create a coach (required by NOT NULL FKs on plans/checkins)
  const coachEmail = `del-coach-for-${Date.now()}@test.local`
  const coach = await createCoach(coachEmail)

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(error?.message ?? 'createUser failed')

  const userId = created.user.id
  const now = new Date().toISOString()

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    email,
    name: 'Delete Me',
    role: 'client',
    coach_id: coach.coachId,
    payment_confirmed: true,
    onboarding_complete: true,
    updated_at: now,
  })
  if (profileError) throw new Error(profileError.message)

  // Create a plan, checkin, workout, support request/message, AI log, purchase, notification, complexity history
  const { data: plan, error: planError } = await admin
    .from('plans')
    .insert({
      client_id: userId,
      coach_id: coach.coachId,
      title: 'Plan',
      phase: null,
      workout_plan: 'Workout',
      nutrition_plan: 'Diet',
      cardio_plan: null,
      supplement_plan: null,
      coach_notes: null,
      version: 1,
      active: true,
      delivered_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()
  if (planError) throw new Error(planError.message)

  const { error: checkinError } = await admin.from('checkins').insert({
    client_id: userId,
    coach_id: coach.coachId,
    submitted_at: now,
    weight: 70,
    waist: 80,
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
    energy_level: 7,
    hunger_level: 5,
    training_performance: 7,
    adherence_score: 7,
    notes: 'ok',
    reviewed: false,
    reviewed_at: null,
    coach_response: null,
  })
  if (checkinError) throw new Error(checkinError.message)

  const { error: workoutError } = await admin.from('workouts').insert({
    user_id: userId,
    name: 'Run',
    duration: 20,
    calories: 100,
    created_at: now,
  })
  if (workoutError) throw new Error(workoutError.message)

  const { data: support, error: supportError } = await admin
    .from('support_requests')
    .insert({
      client_id: userId,
      category: 'general',
      title: 'Help',
      message: 'Hi',
      status: 'open',
      priority: 'normal',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()
  if (supportError) throw new Error(supportError.message)

  const { error: msgError } = await admin.from('support_messages').insert({
    request_id: support.id,
    sender_type: 'client',
    sender_id: userId,
    message: 'msg',
    created_at: now,
  })
  if (msgError) throw new Error(msgError.message)

  const { error: aiLogError } = await admin.from('ai_generation_logs').insert({
    client_id: userId,
    coach_id: null,
    action: 'test',
    model: 'test',
    prompt_version: 'v1',
    latency_ms: 1,
    prompt_tokens: 1,
    completion_tokens: 1,
    retry_count: 0,
    validation_result: 'pass',
    success: true,
    knowledge_refs: [],
    raw_output: {},
    rendered_output: {},
  })
  if (aiLogError) throw new Error(aiLogError.message)

  const { error: purchaseError } = await admin.from('purchases').insert({
    user_id: userId,
    razorpay_payment_id: `rp_${Date.now()}`,
    razorpay_order_id: `ro_${Date.now()}`,
    plan_slug: 'test',
    plan_name: 'Test',
    amount_paise: 100,
    currency: 'INR',
    status: 'paid',
    customer_email: email,
    customer_name: 'Delete Me',
    created_at: now,
  })
  if (purchaseError) throw new Error(purchaseError.message)

  const { error: notifError } = await admin.from('platform_notifications').insert({
    template_key: 'test',
    channel: 'in_app',
    subject: 's',
    body: 'b',
    status: 'sent',
    recipient_id: userId,
    created_at: now,
    updated_at: now,
  })
  if (notifError) throw new Error(notifError.message)

  // complexity history row (table exists after migration)
  await admin.from('complexity_score_history').insert({
    client_id: userId,
    raw_score: 10,
    display_score: 30,
    tier: 'medium',
    trigger_source: 'manual',
    reasoning: [],
  })

  return { userId, planId: plan.id, password, coach }
}

async function createCoach(email: string) {
  const admin = createAdminClient()
  const password = 'Test12345!'
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(error?.message ?? 'createUser failed')

  const userId = created.user.id
  const now = new Date().toISOString()

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    email,
    name: 'Coach Delete',
    role: 'coach',
    payment_confirmed: true,
    onboarding_complete: true,
    updated_at: now,
  })
  if (profileError) throw new Error(profileError.message)

  const { data: coachRow, error: coachError } = await admin
    .from('coaches')
    .insert({ user_id: userId, name: 'Coach Delete', hard_cap: null })
    .select('id')
    .single()
  if (coachError) throw new Error(coachError.message)

  return { coachId: coachRow.id as string, userId }
}

async function countOrFail(table: string, filter: { col: string; val: string }, expected: number) {
  const admin = createAdminClient()
  const { count, error } = await admin
    // @ts-expect-error dynamic table name for verification
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(filter.col, filter.val)
  if (error) throw new Error(error.message)
  if ((count ?? 0) !== expected) {
    throw new Error(`${table} expected ${expected}, got ${count ?? 0}`)
  }
}

async function main() {
  const admin = createAdminClient()
  const deletedBy = (await admin.from('profiles').select('id').eq('role', 'super_admin').limit(1).maybeSingle()).data?.id
  if (!deletedBy) fail('Setup', 'No super_admin profile found to attribute deletion')

  // Client deletion
  const client = await createClientWithData(`del-client-${Date.now()}@test.local`)
  const res1 = await deleteClientAccount({ clientId: client.userId, deletedBy, reason: 'verify' })
  if (!res1.ok) fail('Client deletion', res1.error)

  await countOrFail('profiles', { col: 'id', val: client.userId }, 0)
  await countOrFail('plans', { col: 'client_id', val: client.userId }, 0)
  await countOrFail('checkins', { col: 'client_id', val: client.userId }, 0)
  await countOrFail('support_requests', { col: 'client_id', val: client.userId }, 0)
  await countOrFail('ai_generation_logs', { col: 'client_id', val: client.userId }, 0)
  await countOrFail('purchases', { col: 'user_id', val: client.userId }, 0)
  await countOrFail('platform_notifications', { col: 'recipient_id', val: client.userId }, 0)
  await countOrFail('complexity_score_history', { col: 'client_id', val: client.userId }, 0)
  pass('Client deletion removes all related rows')

  // @ts-expect-error typing varies
  const { data: authUserAfter, error: authGetErr } = await admin.auth.admin.getUserById(client.userId)
  if (!authGetErr && authUserAfter?.user) {
    fail('Client auth deletion', 'Auth user still exists')
  }
  pass('Client auth user removed')

  // cleanup coach created for client test
  await deleteCoachAccount({ coachId: client.coach.coachId, deletedBy, reason: 'cleanup' })

  // Coach deletion blocked without reassignment
  const coachA = await createCoach(`del-coach-a-${Date.now()}@test.local`)
  const coachB = await createCoach(`del-coach-b-${Date.now()}@test.local`)

  // assign one client to coachA
  const assignedClient = await createClientWithData(`del-assigned-${Date.now()}@test.local`)
  const { error: assignErr } = await admin.from('profiles').update({ coach_id: coachA.coachId }).eq('id', assignedClient.userId)
  if (assignErr) throw new Error(assignErr.message)

  const blocked = await deleteCoachAccount({ coachId: coachA.coachId, deletedBy, reason: 'verify' })
  if (blocked.ok || !blocked.blocked) fail('Coach deletion blocked', 'Expected blocked deletion')
  pass('Coach deletion blocked when clients assigned')

  const deletedCoach = await deleteCoachAccount({
    coachId: coachA.coachId,
    deletedBy,
    reason: 'verify',
    reassignToCoachId: coachB.coachId,
  })
  if (!deletedCoach.ok) fail('Coach deletion', deletedCoach.error)

  // ensure reassignment
  await countOrFail('profiles', { col: 'coach_id', val: coachA.coachId }, 0)
  const { data: reassigned } = await admin.from('profiles').select('coach_id').eq('id', assignedClient.userId).maybeSingle()
  if (reassigned?.coach_id !== coachB.coachId) fail('Coach reassignment', 'Client not reassigned')
  pass('Coach reassignment succeeded')

  await countOrFail('coaches', { col: 'id', val: coachA.coachId }, 0)
  await countOrFail('profiles', { col: 'id', val: coachA.userId }, 0)
  pass('Coach rows removed')

  // cleanup: delete assignedClient + coachB to avoid leaving test accounts
  await deleteClientAccount({ clientId: assignedClient.userId, deletedBy, reason: 'cleanup' })
  await deleteCoachAccount({ coachId: coachB.coachId, deletedBy, reason: 'cleanup' })

  pass('Account deletion verification complete')
}

main().catch((err) => {
  fail('Verification', err instanceof Error ? err.message : String(err))
})

