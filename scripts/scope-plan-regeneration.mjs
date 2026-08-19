/**
 * READ-ONLY scoping for the calorie-mismatch regeneration batch.
 * Answers: which live plans are off by more than the 400 kcal hard limit, which of those
 * clients actually use the app daily, and what the regeneration will cost based on real
 * historical token usage. Mutates nothing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const GAP_LIMIT = 400
const WINDOW_DAYS = 14

const report = JSON.parse(readFileSync('scripts/out/calorie-mismatch-report.json', 'utf8'))

// Candidates: live plans (active + paying) whose numbers are off by more than the hard limit.
// Narrative-only conflicts count too when the claim gap exceeds the limit.
const candidates = report.affected.filter((a) => {
  if (!a.active || !a.membershipActive) return false
  const headerGap = a.headerGap ?? 0
  const claimGap = a.conflictingClaims.length
    ? Math.max(...a.conflictingClaims.map((c) => Math.abs(c.claimed - a.foodDerivedCalories)))
    : 0
  return Math.max(headerGap, claimGap) > GAP_LIMIT
})

const clientIds = [...new Set(candidates.map((c) => c.clientId))]
console.log(`Candidates over ${GAP_LIMIT} kcal: ${candidates.length} plans / ${clientIds.length} clients`)

// --- Daily activity over the last N days ---
const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
const dayKey = (ts) =>
  new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().slice(0, 10)

const activeDays = new Map(clientIds.map((id) => [id, new Set()]))

const [tracker, checkins, chats] = await Promise.all([
  admin.from('daily_tracker_days').select('client_id, log_date, updated_at').in('client_id', clientIds).gte('updated_at', since),
  admin.from('checkins').select('client_id, submitted_at').in('client_id', clientIds).gte('submitted_at', since),
  admin
    .from('conversation_messages')
    .select('sender_id, created_at')
    .eq('sender_type', 'client')
    .in('sender_id', clientIds)
    .gte('created_at', since),
])

for (const r of tracker.data ?? []) {
  const set = activeDays.get(r.client_id)
  if (set) set.add(r.log_date ?? dayKey(r.updated_at))
}
for (const r of checkins.data ?? []) {
  activeDays.get(r.client_id)?.add(dayKey(r.submitted_at))
}
for (const r of chats.data ?? []) {
  activeDays.get(r.sender_id)?.add(dayKey(r.created_at))
}

const daysFor = (id) => activeDays.get(id)?.size ?? 0

const thresholds = [14, 12, 10, 7, 5, 1]
console.log(`\n--- Candidate clients by active days in last ${WINDOW_DAYS} ---`)
for (const t of thresholds) {
  console.log(`  >= ${String(t).padStart(2)} days: ${clientIds.filter((id) => daysFor(id) >= t).length} clients`)
}

// --- Real cost from historical AI logs ---
// Diet-only regeneration is closest to edit_plan_nutrition / initial_diet, not the full
// weekly_draft (which bundles workout + cardio + supplements and ~60k input tokens).
const { data: logs } = await admin
  .from('ai_generation_logs')
  .select('action, model, prompt_tokens, completion_tokens')
  .in('action', ['edit_plan_nutrition', 'review_update_diet', 'onboarding_background_initial_diet'])
  .eq('success', true)
  .order('created_at', { ascending: false })
  .limit(400)

const usable = (logs ?? []).filter((l) => l.prompt_tokens && l.completion_tokens)
const avgIn = usable.reduce((a, l) => a + l.prompt_tokens, 0) / (usable.length || 1)
const avgOut = usable.reduce((a, l) => a + l.completion_tokens, 0) / (usable.length || 1)

// Anthropic list pricing (USD per million tokens)
const PRICING = {
  sonnet: { in: 3, out: 15 },
  haiku: { in: 1, out: 5 },
}
const modelCounts = {}
for (const l of usable) modelCounts[l.model ?? 'unknown'] = (modelCounts[l.model ?? 'unknown'] ?? 0) + 1
const isSonnet = Object.keys(modelCounts).some((m) => m.includes('sonnet'))
const price = isSonnet ? PRICING.sonnet : PRICING.haiku
const perPlanUsd = (avgIn / 1e6) * price.in + (avgOut / 1e6) * price.out

console.log(`\n--- Cost basis (from ${usable.length} real review_update_diet generations) ---`)
console.log(`  models seen        : ${JSON.stringify(modelCounts)}`)
console.log(`  avg input tokens   : ${Math.round(avgIn)}`)
console.log(`  avg output tokens  : ${Math.round(avgOut)}`)
console.log(`  cost per diet regen: $${perPlanUsd.toFixed(4)} (~Rs ${(perPlanUsd * 88).toFixed(2)})`)

console.log(`\n--- Projected cost by activity threshold (diet only, 1 attempt) ---`)
for (const t of thresholds) {
  const n = clientIds.filter((id) => daysFor(id) >= t).length
  const usd = n * perPlanUsd
  console.log(
    `  >= ${String(t).padStart(2)} days: ${String(n).padStart(3)} clients = $${usd.toFixed(2)} (~Rs ${(usd * 88).toFixed(0)})`
  )
}
console.log(`\n  Note: budget ~1.6x for occasional validation retries.`)

const enriched = candidates
  .map((c) => ({ ...c, activeDays: daysFor(c.clientId) }))
  .sort((a, b) => b.activeDays - a.activeDays)

mkdirSync('scripts/out', { recursive: true })
writeFileSync(
  'scripts/out/regeneration-scope.json',
  JSON.stringify(
    { generatedAt: new Date().toISOString(), gapLimit: GAP_LIMIT, windowDays: WINDOW_DAYS, perPlanUsd, candidates: enriched },
    null,
    2
  )
)
console.log('\nScope written: scripts/out/regeneration-scope.json')
