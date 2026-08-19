/**
 * READ-ONLY: verify dietTextHasCalorieConflict() against real stored plans.
 * Confirms the detector catches the known-broken plans and leaves clean plans alone,
 * so "fix it at the next check-in" actually triggers a regeneration.
 */
import { readFileSync } from 'node:fs'
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

// --- mirror of src/lib/ai/nutrition-macro-sync.ts detector ---
const MEAL_MACRO_LINE =
  /\(P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g\s*\|\s*~?\s*(\d+)\s*kcal\)/gi
const DAILY_SUMMARY_LINE =
  /~?\s*(\d{3,4})\s*kcal\s*\|\s*(\d+)\s*g\s*protein\s*\|\s*(\d+)\s*g\s*carbs\s*\|\s*(\d+)\s*g\s*fat/gi
const HEADER_CALORIES = /calories:\s*(\d+)/i
const MIN = 1000
const MAX = 5000
const TOL = 40

const all = (text, src) => {
  const out = []
  const p = new RegExp(src, 'gi')
  let m
  while ((m = p.exec(text)) !== null) out.push(m)
  return out
}
const isSot = (line) =>
  new RegExp(MEAL_MACRO_LINE.source, 'i').test(line) ||
  new RegExp(DAILY_SUMMARY_LINE.source, 'i').test(line) ||
  /daily\s+(total|totals|average|averages)/i.test(line)

function infer(text) {
  const daily = all(text, DAILY_SUMMARY_LINE.source)
  if (daily.length) return Math.round(daily.reduce((a, m) => a + +m[1], 0) / daily.length)
  const meals = all(text, MEAL_MACRO_LINE.source)
  if (meals.length) {
    const sum = meals.reduce((a, m) => a + +m[4], 0)
    return Math.round(sum / (meals.length >= 14 ? 7 : 1))
  }
  return null
}

function hasConflict(text) {
  if (!text?.trim()) return false
  const inferred = infer(text)
  if (!inferred || inferred <= 0) return false
  if (all(text, MEAL_MACRO_LINE.source).length === 0 && all(text, DAILY_SUMMARY_LINE.source).length === 0)
    return false

  const h = text.match(HEADER_CALORIES)
  if (h) {
    const hv = parseInt(h[1], 10)
    if (Number.isFinite(hv) && hv > 0 && Math.abs(hv - inferred) > TOL) return true
  }
  const claim = /(\d[\d,]{2,4})(\s*(?:k?cal\b|calories?\b))/gi
  for (const line of text.split('\n')) {
    if (isSot(line)) continue
    if (/^\s*calories:\s*\d+/i.test(line)) continue
    let m
    const p = new RegExp(claim.source, 'gi')
    while ((m = p.exec(line)) !== null) {
      const v = parseInt(m[1].replace(/,/g, ''), 10)
      if (!Number.isFinite(v) || v < MIN || v > MAX) continue
      if (Math.abs(v - inferred) > TOL) return true
    }
  }
  return false
}

const report = JSON.parse(readFileSync('scripts/out/calorie-mismatch-report.json', 'utf8'))
const knownBad = new Set(report.affected.map((a) => a.planId))

const { data: rows, error } = await admin
  .from('plans')
  .select('id, active, delivered_at, nutrition_plan')
  .not('delivered_at', 'is', null)
  .not('nutrition_plan', 'is', null)
  .neq('nutrition_plan', '')

if (error) {
  console.error(error.message)
  process.exit(1)
}

let truePos = 0
let falseNeg = 0
let flaggedClean = 0
let cleanTotal = 0
let activeFlagged = 0

for (const r of rows) {
  const flagged = hasConflict(r.nutrition_plan)
  if (knownBad.has(r.id)) {
    flagged ? truePos++ : falseNeg++
  } else {
    cleanTotal++
    if (flagged) flaggedClean++
  }
  if (flagged && r.active) activeFlagged++
}

console.log('=== Conflict detector verification (READ ONLY) ===')
console.log(`Plans checked            : ${rows.length}`)
console.log(`Known-bad caught         : ${truePos} / ${truePos + falseNeg}`)
console.log(`Known-bad missed         : ${falseNeg}`)
console.log(`Clean plans flagged      : ${flaggedClean} / ${cleanTotal}`)
console.log('')
console.log(`ACTIVE plans that will force a regeneration at next check-in: ${activeFlagged}`)
