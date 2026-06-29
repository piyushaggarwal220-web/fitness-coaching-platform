/**
 * One-off Anthropic integration test — run: node scripts/test-anthropic-plan.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const BASE = 'http://localhost:3000'
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function seed(action, payload = {}) {
  const res = await fetch(`${BASE}/api/dev/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Seed ${action} failed`)
  return json.data ?? {}
}

console.log('API key configured:', Boolean(process.env.ANTHROPIC_API_KEY?.trim()))
console.log('Provider mode:', process.env.AI_PLAN_PROVIDER ?? '(default claude)')

let coachData
try {
  coachData = await seed('ensure_test_coach')
} catch {
  coachData = { email: 'dev-coach@dev.local', password: 'TestPass123!' }
}

const clientData = await seed('ensure_test_client')

const loginEmail = coachData.email ?? 'dev-coach@dev.local'
const { error: loginErr } = await sb.auth.signInWithPassword({
  email: loginEmail,
  password: coachData.password ?? 'TestPass123!',
})

if (loginErr) {
  console.error('Coach login failed:', loginErr.message)
  process.exit(1)
}

if (!coachData.coachId) {
  const userId = (await sb.auth.getUser()).data.user?.id
  const { data: coachLookup } = await admin.from('coaches').select('id').eq('user_id', userId).maybeSingle()
  coachData.coachId = coachLookup?.id
}

if (!coachData.coachId) {
  console.error('Could not resolve coach ID')
  process.exit(1)
}

await seed('assign_client_to_coach', { clientId: clientData.clientId, coachId: coachData.coachId })
await seed('mark_onboarding_complete', { clientId: clientData.clientId })

const profileRow = (await admin.from('profiles').select('*').eq('id', clientData.clientId).single()).data
const coachRow = (await admin.from('coaches').select('id, user_id').eq('id', coachData.coachId).single()).data

if (!profileRow || !coachRow) {
  console.error('Failed to prepare test client/coach')
  process.exit(1)
}

const session = (await sb.auth.getSession()).data.session
const cookie = `sb-zhcedsmvpvpaqezbdiiy-auth-token=${encodeURIComponent(JSON.stringify(session))}`

console.log('Client:', profileRow.id, profileRow.name ?? profileRow.email)
console.log('Generating plan via Anthropic...')

const started = Date.now()
const res = await fetch(`${BASE}/api/coach/generate-plan`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    clientId: profileRow.id,
    coachInstructions: 'Focus on sustainable fat loss with 4 training days.',
  }),
})

const json = await res.json()
console.log('HTTP', res.status, `${Date.now() - started}ms`)

if (!res.ok || !json.success) {
  console.error('GENERATION FAILED')
  console.error(json.error ?? JSON.stringify(json))
  process.exit(1)
}

console.log('Model:', json.selectedModel)
console.log('Tokens in/out:', json.inputTokens, json.outputTokens)
console.log('Form title:', json.formData?.title)
console.log('Sections:', {
  workout: Boolean(json.formData?.workout_plan?.trim()),
  nutrition: Boolean(json.formData?.nutrition_plan?.trim()),
  cardio: Boolean(json.formData?.cardio_plan?.trim()),
  supplements: Boolean(json.formData?.supplement_plan?.trim()),
  notes: Boolean(json.formData?.coach_notes?.trim()),
})

const required = ['workout_plan', 'nutrition_plan', 'cardio_plan', 'supplement_plan', 'coach_notes']
const missing = required.filter((k) => !json.generatedPlan?.[k])
console.log('JSON validation:', missing.length === 0 ? 'PASS' : `FAIL missing ${missing.join(', ')}`)

if (missing.length > 0) {
  console.error('Raw generatedPlan:', JSON.stringify(json.generatedPlan).slice(0, 4000))
  process.exit(1)
}

// Save draft
const now = new Date().toISOString()
const { count } = await admin.from('plans').select('*', { count: 'exact', head: true }).eq('client_id', profileRow.id)
const form = json.formData
const { data: draft, error: insertErr } = await admin.from('plans').insert({
  client_id: profileRow.id,
  coach_id: coachRow.id,
  title: form.title,
  phase: form.phase,
  workout_plan: form.workout_plan,
  nutrition_plan: form.nutrition_plan,
  cardio_plan: form.cardio_plan,
  supplement_plan: form.supplement_plan,
  coach_notes: form.coach_notes,
  version: (count ?? 0) + 1,
  active: false,
  created_at: now,
  updated_at: now,
}).select().single()

if (insertErr || !draft) {
  console.error('Save draft FAILED:', insertErr?.message)
  process.exit(1)
}
console.log('Save draft: PASS', draft.id, 'active=', draft.active)

// Deliver
await admin.from('plans').update({ active: false }).eq('client_id', profileRow.id).neq('id', draft.id)
await admin.from('plans').update({ active: true, delivered_at: now, updated_at: now }).eq('id', draft.id)
await admin.from('profiles').update({ plan_delivered: true, updated_at: now }).eq('id', profileRow.id)

const { data: delivered } = await admin.from('plans').select('active').eq('id', draft.id).single()
console.log('Deliver to client: PASS', delivered?.active === true)

console.log('\nALL CHECKS PASSED')
