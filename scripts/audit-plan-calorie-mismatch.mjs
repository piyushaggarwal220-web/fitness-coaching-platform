/**
 * READ-ONLY audit: find delivered/active plans whose diet prose states a daily calorie
 * number that contradicts the food-derived total (the "header 1450 / text says 1700" bug).
 * Writes a JSON report to scripts/out/calorie-mismatch-report.json. Mutates nothing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// --- detection logic mirrored from src/lib/ai/nutrition-macro-sync.ts ---
const MEAL_MACRO_LINE =
  /\(P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g\s*\|\s*~?\s*(\d+)\s*kcal\)/gi
const DAILY_SUMMARY_LINE =
  /~?\s*(\d{3,4})\s*kcal\s*\|\s*(\d+)\s*g\s*protein\s*\|\s*(\d+)\s*g\s*carbs\s*\|\s*(\d+)\s*g\s*fat/gi
const HEADER_CALORIES = /calories:\s*(\d+)/i

const MIN_DAILY_KCAL = 1000
const MAX_DAILY_KCAL = 5000
const TOLERANCE = 40

function parseAll(text, source) {
  const out = []
  const pattern = new RegExp(source, 'gi')
  let m
  while ((m = pattern.exec(text)) !== null) out.push(m)
  return out
}

function isSourceOfTruthLine(line) {
  if (new RegExp(MEAL_MACRO_LINE.source, 'i').test(line)) return true
  if (new RegExp(DAILY_SUMMARY_LINE.source, 'i').test(line)) return true
  return /daily\s+(total|totals|average|averages)/i.test(line)
}

/**
 * Food-derived daily calories: daily-average lines first, else meal lines summed.
 * Confidence matters — a plan where only some meals carry macro lines will under-report,
 * so we must not "correct" prose against an unreliable total.
 */
function foodDerivedCalories(text) {
  const daily = parseAll(text, DAILY_SUMMARY_LINE.source)
  const meals = parseAll(text, MEAL_MACRO_LINE.source)

  if (daily.length > 0) {
    const values = daily.map((m) => parseInt(m[1], 10))
    const sum = values.reduce((a, v) => a + v, 0)
    const spread = Math.max(...values) - Math.min(...values)
    return {
      value: Math.round(sum / daily.length),
      basis: 'daily-average',
      dailyLines: daily.length,
      mealLines: meals.length,
      // 5+ explicit daily totals that agree closely = trustworthy source of truth
      confidence: daily.length >= 5 && spread <= 400 ? 'high' : daily.length >= 3 ? 'medium' : 'low',
    }
  }

  if (meals.length > 0) {
    const sum = meals.reduce((a, m) => a + parseInt(m[4], 10), 0)
    const divisor = meals.length >= 14 ? 7 : 1
    const value = Math.round(sum / divisor)
    // 21-35 meal lines = ~3-5 meals x 7 days, the expected shape. Anything else is suspect.
    const wellFormed = meals.length >= 21 && meals.length <= 42
    return {
      value,
      basis: 'meal-lines',
      dailyLines: 0,
      mealLines: meals.length,
      confidence: wellFormed && value >= 1200 ? 'medium' : 'low',
    }
  }

  return null
}

/** Conversational calorie claims that contradict the food math. */
function conflictingClaims(text, target) {
  const claim = /(\d[\d,]{2,4})(\s*(?:k?cal\b|calories?\b))/gi
  const hits = []
  for (const line of text.split('\n')) {
    if (isSourceOfTruthLine(line)) continue
    if (/^\s*calories:\s*\d+/i.test(line)) continue // the generated header itself
    let m
    const p = new RegExp(claim.source, 'gi')
    while ((m = p.exec(line)) !== null) {
      const value = parseInt(m[1].replace(/,/g, ''), 10)
      if (!Number.isFinite(value)) continue
      if (value < MIN_DAILY_KCAL || value > MAX_DAILY_KCAL) continue
      if (Math.abs(value - target) <= TOLERANCE) continue
      hits.push({ claimed: value, snippet: line.trim().slice(0, 160) })
    }
  }
  return hits
}

const { data: rows, error } = await admin
  .from('plans')
  .select(
    'id, client_id, title, version, active, delivered_at, created_at, nutrition_plan, profiles:client_id(name, email, payment_confirmed, subscription_expires_at, access_source)'
  )
  .not('delivered_at', 'is', null)
  .not('nutrition_plan', 'is', null)
  .neq('nutrition_plan', '')
  .order('delivered_at', { ascending: false })

if (error) {
  console.error('Query failed:', error.message)
  process.exit(1)
}

const affected = []
let scanned = 0
let noFoodMath = 0
let headerMismatch = 0

for (const row of rows) {
  scanned += 1
  const prof = row.profiles ?? {}
  const text = row.nutrition_plan
  const food = foodDerivedCalories(text)
  if (!food) {
    noFoodMath += 1
    continue
  }
  const headerMatch = text.match(HEADER_CALORIES)
  const header = headerMatch ? parseInt(headerMatch[1], 10) : null
  const headerOff = header != null && Math.abs(header - food.value) > TOLERANCE
  if (headerOff) headerMismatch += 1

  const claims = conflictingClaims(text, food.value)
  if (claims.length > 0 || headerOff) {
    affected.push({
      planId: row.id,
      clientId: row.client_id,
      clientName: prof.name,
      clientEmail: prof.email,
      title: row.title,
      version: row.version,
      active: row.active,
      deliveredAt: row.delivered_at,
      membershipActive:
        prof.access_source === 'admin_trial' ||
        (prof.payment_confirmed === true &&
          (!prof.subscription_expires_at || new Date(prof.subscription_expires_at) > new Date())),
      foodDerivedCalories: food.value,
      foodBasis: food.basis,
      confidence: food.confidence,
      dailyLines: food.dailyLines,
      mealLines: food.mealLines,
      headerCalories: header,
      headerMismatch: headerOff,
      headerGap: header != null ? Math.abs(header - food.value) : null,
      conflictingClaims: claims.slice(0, 5),
    })
  }
}

mkdirSync('scripts/out', { recursive: true })
writeFileSync(
  'scripts/out/calorie-mismatch-report.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), scanned, affected }, null, 2)
)

const activePlans = affected.filter((a) => a.active)
const live = affected.filter((a) => a.active && a.membershipActive)

const byConf = (list, c) => list.filter((a) => a.confidence === c)

console.log('=== Delivered plan calorie audit (READ ONLY) ===')
console.log(`Delivered plans scanned : ${scanned}`)
console.log(`No parseable food math  : ${noFoodMath}`)
console.log(`Affected plans          : ${affected.length}`)
console.log(`  ...of which active    : ${activePlans.length}`)
console.log(`  ...active + paying    : ${live.length}`)
console.log(`Header vs food mismatch : ${headerMismatch}`)
console.log('')
console.log('--- LIVE plans (active + paying) by confidence in the food-derived total ---')
for (const c of ['high', 'medium', 'low']) {
  const bucket = byConf(live, c)
  console.log(`  ${c.padEnd(6)}: ${bucket.length}`)
}
console.log('')
console.log('--- LIVE plans by problem type ---')
const headerOnly = live.filter((a) => a.headerMismatch && a.conflictingClaims.length === 0)
const textOnly = live.filter((a) => !a.headerMismatch && a.conflictingClaims.length > 0)
const both = live.filter((a) => a.headerMismatch && a.conflictingClaims.length > 0)
console.log(`  header wrong only     : ${headerOnly.length}`)
console.log(`  narrative wrong only  : ${textOnly.length}`)
console.log(`  both wrong            : ${both.length}`)
console.log('')
console.log('--- Size of header gap (live plans) ---')
const gaps = live.map((a) => a.headerGap).filter((g) => g != null).sort((a, b) => a - b)
if (gaps.length) {
  const pct = (p) => gaps[Math.floor((gaps.length - 1) * p)]
  console.log(`  median ${pct(0.5)} kcal | p90 ${pct(0.9)} kcal | max ${gaps[gaps.length - 1]} kcal`)
  console.log(`  gap > 300 kcal        : ${gaps.filter((g) => g > 300).length}`)
  console.log(`  gap > 500 kcal        : ${gaps.filter((g) => g > 500).length}`)
}
console.log('')
console.log('--- LOW confidence live plans (food math itself is unreliable — do NOT auto-fix) ---')
for (const a of byConf(live, 'low').slice(0, 15)) {
  console.log(
    `  ${a.clientName ?? a.clientEmail} | food=${a.foodDerivedCalories} (${a.basis ?? a.foodBasis}, meals=${a.mealLines}, daily=${a.dailyLines}) header=${a.headerCalories ?? 'n/a'}`
  )
}
console.log('')
console.log('Full report: scripts/out/calorie-mismatch-report.json')
