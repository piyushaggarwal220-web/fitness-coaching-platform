/**
 * Create trial clients, generate real AI diet plans, and score lifestyle follow-through.
 *
 * Run:
 *   npx tsx --env-file=.env.local.txt scripts/smoke-20-lifestyle-plans.ts
 *   npx tsx --env-file=.env.local.txt scripts/smoke-20-lifestyle-plans.ts --scenarios --concurrency=2
 *
 * Options:
 *   --count=20          number of clients (default 20, or the scenario pool size)
 *   --scenarios         30 curated lifestyle scenarios (not random meals)
 *   --concurrency=2     parallel AI generations (default 2)
 *   --skip-ai           create clients only (no plan generation)
 *   --cleanup           delete the trial clients created in this run's report
 *   --report=file.json  report path (default tmp-lifestyle-20-report.json)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  createFakeTrialClient,
  listCoachesForAssignment,
} from '../src/lib/admin/testing-accounts'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { generatedDietFormData } from '../src/lib/ai/plan-format'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { OnboardingProfile } from '../src/types/database'
import { LIFESTYLE_SCENARIOS, finalSmokeScenarios, type LifestyleScenario } from './lifestyle-smoke-scenarios'

process.env.AI_PLAN_PROVIDER = process.env.AI_PLAN_PROVIDER || 'claude'

type Check = { name: string; ok: boolean; detail: string }
type ClientResult = {
  index: number
  scenarioId: string | null
  scenarioLabel: string | null
  clientId: string
  email: string
  name: string
  dietPreference: string | null
  breakfast: string | null
  lunch: string | null
  dinner: string | null
  timingBreakfast: string | null
  timingLunch: string | null
  timingDinner: string | null
  favorites: string | null
  disliked: string | null
  allergies: string | null
  whey: string | null
  cookingAbility: string | null
  planChars: number
  checks: Check[]
  passed: number
  failed: number
  error?: string
}

const EXPENSIVE_FOODS = [
  'avocado',
  'quinoa',
  'salmon',
  'berries',
  'blueberry',
  'steak',
  'sushi',
  'almond butter',
  'protein bar',
  'chia',
  'acai',
  'asparagus',
  'kale',
]

function resolveReportPath(): string {
  const custom = process.argv.find((a) => a.startsWith('--report='))
  if (custom) return join(process.cwd(), custom.slice('--report='.length))
  const name = process.argv.includes('--final')
    ? 'tmp-lifestyle-20-final-report.json'
    : process.argv.includes('--scenarios')
      ? 'tmp-lifestyle-30-report.json'
      : 'tmp-lifestyle-20-report.json'
  return join(process.cwd(), name)
}

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function containsAny(haystack: string, needles: string[]): string[] {
  const h = normalize(haystack)
    .replace(/\b(coconut|soy|soya|oat|almond|rice|cashew|pea)\s+milk\b/gi, 'plantmilk')
    .replace(/\b(peanut|almond|cashew|seed)\s+butter\b/gi, 'nutbutter')
  return needles.filter((n) => {
    const needle = normalize(n)
    if (!needle) return false
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(h)
  })
}

function timeVariants(t: string | null | undefined): string[] {
  if (!t?.trim()) return []
  const raw = t.trim()
  const [hh, mm] = raw.split(':')
  if (!hh || !mm) return [raw]
  const h = Number(hh)
  const m = mm
  const ampm = h === 0 ? 12 : h > 12 ? h - 12 : h
  const suffix = h >= 12 ? 'pm' : 'am'
  return [
    raw,
    `${h}:${m}`,
    `${ampm}:${m}${suffix}`,
    `${ampm}:${m} ${suffix}`,
    `${ampm}${suffix}`,
  ]
}

function keywordHits(source: string | null | undefined): string[] {
  if (!source?.trim()) return []
  return source
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
    .filter((w) => !['with', 'and', 'from', 'side', 'bowl', 'small', 'toast', 'black', 'skip', 'skips'].includes(w))
}

function splitDays(dietText: string): Array<{ day: number; weekday: string; body: string }> {
  const re = /Day\s*(\d)\s*\(([^)]+)\)/gi
  const matches = [...dietText.matchAll(re)]
  const out: Array<{ day: number; weekday: string; body: string }> = []
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    const start = (match.index ?? 0) + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index ?? dietText.length : dietText.length
    out.push({
      day: Number(match[1]),
      weekday: (match[2] ?? '').trim().toLowerCase(),
      body: dietText.slice(start, end),
    })
  }
  return out
}

function proteinHits(text: string, kind: 'egg' | 'chicken' | 'fish'): string[] {
  if (kind === 'egg') return containsAny(text, ['eggs', 'egg', 'omelette', 'omelet', 'anda'])
  if (kind === 'chicken') return containsAny(text, ['chicken', 'murgh'])
  return containsAny(text, ['fish', 'macher', 'rohu', 'pomfret', 'salmon', 'tuna'])
}

function scoreLifestyle(
  profile: OnboardingProfile,
  dietText: string,
  scenario?: LifestyleScenario
): Check[] {
  const checks: Check[] = []
  const data = profile.onboarding_data
  const diet = data?.diet
  const eating = data?.eatingPattern
  const pref = profile.diet_preference ?? ''

  const daysOk = [1, 2, 3, 4, 5, 6, 7].every((d) =>
    new RegExp(`Day\\s*${d}\\s*\\(`, 'i').test(dietText)
  )
  checks.push({
    name: 'Has Day 1–7 headers',
    ok: daysOk,
    detail: daysOk ? 'all 7 day headers found' : 'missing day headers',
  })

  const forbiddenByPref: string[] = []
  if (pref === 'vegetarian') {
    forbiddenByPref.push('chicken', 'fish', 'mutton', 'prawn', 'egg', 'eggs', 'omelette', 'omelet')
  } else if (pref === 'vegan') {
    forbiddenByPref.push(
      'chicken',
      'fish',
      'mutton',
      'prawn',
      'egg',
      'eggs',
      'paneer',
      'curd',
      'ghee',
      'whey',
      'milk',
      'butter',
      'yogurt',
      'cheese'
    )
  } else if (pref === 'eggetarian') {
    forbiddenByPref.push('chicken', 'fish', 'mutton', 'prawn')
  }
  const prefHits = containsAny(dietText, forbiddenByPref)
  checks.push({
    name: `Diet preference (${pref || 'unknown'})`,
    ok: prefHits.length === 0,
    detail: prefHits.length ? `forbidden foods found: ${prefHits.join(', ')}` : 'no forbidden foods',
  })

  const disliked = diet?.foodsDisliked?.trim()
  if (disliked && !/^none$/i.test(disliked)) {
    const hits = containsAny(dietText, [disliked])
    checks.push({
      name: 'Avoids disliked foods',
      ok: hits.length === 0,
      detail: hits.length ? `found: ${hits.join(', ')}` : `ok (${disliked})`,
    })
  } else {
    checks.push({ name: 'Avoids disliked foods', ok: true, detail: 'none listed' })
  }

  const allergies = diet?.allergies?.trim()
  if (allergies && !/^none$/i.test(allergies)) {
    const allergyTokens: string[] = []
    // Soft sensitivities are advisory; only hard-fail clear allergens.
    if (/lactose intolerant/i.test(allergies)) allergyTokens.push('milkshake', 'paneer', 'curd', 'cheese', 'whey', 'yogurt')
    if (/gluten allergy|celiac/i.test(allergies)) allergyTokens.push('roti', 'wheat', 'bread', 'paratha', 'atta')
    if (/nut allergy/i.test(allergies)) allergyTokens.push('peanut', 'almond', 'cashew', 'walnut')
    if (allergyTokens.length === 0) {
      checks.push({
        name: 'Avoids allergy-related foods',
        ok: true,
        detail: `advisory only (${allergies})`,
      })
    } else {
      const hits = containsAny(dietText, allergyTokens)
      checks.push({
        name: 'Avoids allergy-related foods',
        ok: hits.length === 0,
        detail: hits.length ? `found: ${hits.join(', ')}` : `ok (${allergies})`,
      })
    }
  } else {
    checks.push({ name: 'Avoids allergy-related foods', ok: true, detail: 'none listed' })
  }

  const timingFields = [
    ['breakfast', eating?.timings?.breakfast],
    ['lunch', eating?.timings?.lunch],
    ['dinner', eating?.timings?.dinner],
    ['snacks', eating?.timings?.snacks],
  ] as const
  let timingHits = 0
  let timingExpected = 0
  const timingDetails: string[] = []
  for (const [label, t] of timingFields) {
    if (!t?.trim()) {
      timingDetails.push(`${label}=—(skipped)`)
      continue
    }
    timingExpected += 1
    const variants = timeVariants(t)
    const found = variants.some((v) => normalize(dietText).includes(normalize(v)))
    if (found) timingHits += 1
    timingDetails.push(`${label}=${t}(${found ? 'hit' : 'miss'})`)
  }
  checks.push({
    name: 'Meal timings reflected',
    ok: timingExpected === 0 || timingHits === timingExpected,
    detail: `${timingHits}/${timingExpected} — ${timingDetails.join('; ')}`,
  })

  const mealSlots: Array<['breakfast' | 'lunch' | 'dinner' | 'snacks', string | null | undefined]> = [
    ['breakfast', eating?.breakfast],
    ['lunch', eating?.lunch],
    ['dinner', eating?.dinner],
    ['snacks', eating?.snacks],
  ]
  for (const [slot, source] of mealSlots) {
    if (!source?.trim() || /skip/i.test(source)) continue
    const keys = [...new Set(keywordHits(source))].slice(0, 8)
    if (keys.length === 0) continue
    const matched = keys.filter((k) => normalize(dietText).includes(k))
    checks.push({
      name: `Usual ${slot} foods in plan`,
      ok: matched.length >= 1,
      detail:
        matched.length > 0
          ? `matched: ${matched.join(', ')}`
          : `none of [${keys.slice(0, 5).join(', ')}] found — likely ignored this meal`,
    })
  }

  const mealSources = [eating?.breakfast, eating?.lunch, eating?.dinner, diet?.favoriteFoods]
  const keywords = mealSources.flatMap((s) => keywordHits(s ?? undefined))
  const unique = [...new Set(keywords)].slice(0, 20)
  const matched = unique.filter((k) => normalize(dietText).includes(k))
  const need = Math.min(4, unique.length)
  checks.push({
    name: 'Usual/favorite food themes present',
    ok: unique.length === 0 || matched.length >= need,
    detail:
      unique.length === 0
        ? 'no keywords'
        : `${matched.length}/${unique.length} keywords (need ${need}) — matched: ${matched.slice(0, 8).join(', ') || 'none'}`,
  })

  const whey = diet?.wheyProtein
  if (whey === 'no') {
    const hasWhey = /\bwhey\b/i.test(dietText)
    checks.push({
      name: 'No whey when client does not use it',
      ok: !hasWhey,
      detail: hasWhey ? 'whey mentioned' : 'ok',
    })
  } else {
    checks.push({
      name: 'Whey rule',
      ok: true,
      detail: whey === 'yes' ? 'client uses whey (optional in plan)' : 'n/a',
    })
  }

  const cooking = diet?.cookingAbility
  if (cooking === 'basic' || cooking === 'minimal') {
    const fancy = containsAny(dietText, [
      'sous vide',
      'degustation',
      'emulsion',
      'molecular',
      'air fryer gourmet',
      'slow braise',
    ])
    checks.push({
      name: `Cooking ability (${cooking})`,
      ok: fancy.length === 0,
      detail: fancy.length ? `fancy terms: ${fancy.join(', ')}` : 'simple language ok',
    })
  } else {
    checks.push({
      name: 'Cooking ability',
      ok: true,
      detail: cooking ?? 'n/a',
    })
  }

  const days = splitDays(dietText)
  const eggDays = (diet?.eggAllowedDays ?? []).map((d) => d.toLowerCase())
  const chickenDays = (diet?.chickenAllowedDays ?? []).map((d) => d.toLowerCase())
  const fishDays = (diet?.fishAllowedDays ?? []).map((d) => d.toLowerCase())
  if (days.length > 0 && (eggDays.length || chickenDays.length || fishDays.length)) {
    const leaks: string[] = []
    for (const d of days) {
      if (eggDays.length && !eggDays.includes(d.weekday)) {
        const hits = proteinHits(d.body, 'egg')
        if (hits.length) leaks.push(`${d.weekday} eggs:${hits.join('/')}`)
      }
      if (chickenDays.length && !chickenDays.includes(d.weekday)) {
        const hits = proteinHits(d.body, 'chicken')
        if (hits.length) leaks.push(`${d.weekday} chicken:${hits.join('/')}`)
      }
      if (fishDays.length && !fishDays.includes(d.weekday)) {
        const hits = proteinHits(d.body, 'fish')
        if (hits.length) leaks.push(`${d.weekday} fish:${hits.join('/')}`)
      }
    }
    checks.push({
      name: 'Animal protein only on allowed weekdays',
      ok: leaks.length === 0,
      detail: leaks.length ? leaks.slice(0, 6).join('; ') : 'ok',
    })
  }

  if (scenario) {
    const includeHits = scenario.mustInclude.filter((k) => normalize(dietText).includes(normalize(k)))
    const includeNeed = Math.min(2, scenario.mustInclude.length)
    checks.push({
      name: `Lifestyle staples (${scenario.id})`,
      ok: includeHits.length >= includeNeed,
      detail: `matched ${includeHits.join(', ') || 'none'} / need ${scenario.mustInclude.join(', ')}`,
    })

    const excludeHits = containsAny(dietText, scenario.mustExclude)
    checks.push({
      name: 'Did not invent off-lifestyle foods',
      ok: excludeHits.length === 0,
      detail: excludeHits.length ? `found: ${excludeHits.join(', ')}` : 'ok',
    })

    if (scenario.skipBreakfast) {
      const breakfastMentions = (dietText.match(/\bBreakfast\b/g) ?? []).length
      checks.push({
        name: 'Did not invent a breakfast slot',
        ok: breakfastMentions <= 2,
        detail:
          breakfastMentions > 2
            ? `Breakfast appears ${breakfastMentions} times — client skips breakfast`
            : `Breakfast mentions=${breakfastMentions}`,
      })
    }
    if (scenario.skipLunch) {
      const lunchMentions = (dietText.match(/\bLunch\b/g) ?? []).length
      checks.push({
        name: 'Did not invent a lunch slot on skip-lunch lifestyle',
        ok: lunchMentions <= 3,
        detail:
          lunchMentions > 3
            ? `Lunch appears ${lunchMentions} times — client sleeps through lunch`
            : `Lunch mentions=${lunchMentions}`,
      })
    }
    if (scenario.requireSnack && eating?.snacks?.trim()) {
      const snackKeys = keywordHits(eating.snacks).slice(0, 6)
      const snackHit =
        /\bsnack/i.test(dietText) || snackKeys.some((k) => normalize(dietText).includes(k))
      checks.push({
        name: 'Snack slot from lifestyle kept',
        ok: snackHit,
        detail: snackHit ? 'snack reflected' : `missing snacks (${eating.snacks})`,
      })
    }
    if (scenario.lowBudget) {
      const pricey = containsAny(dietText, EXPENSIVE_FOODS)
      checks.push({
        name: 'Stayed within low food budget',
        ok: pricey.length === 0,
        detail: pricey.length ? `expensive foods: ${pricey.join(', ')}` : 'ok',
      })
    }
    if (scenario.sameDaily && days.length >= 5) {
      const staple = scenario.mustInclude[0]
      const daysWithStaple = days.filter((d) => normalize(d.body).includes(normalize(staple))).length
      checks.push({
        name: 'Same-daily preference (staple repeats)',
        ok: daysWithStaple >= 5,
        detail: `"${staple}" on ${daysWithStaple}/${days.length} days`,
      })
    }
    if (scenario.fastingWeekday) {
      const fastDay = days.find((d) => d.weekday === scenario.fastingWeekday)
      const body = fastDay?.body ?? ''
      const mentionsFast = /fast|vrat|fruit and milk|sunset|light dinner/i.test(body)
      const heavy = proteinHits(body, 'chicken').length + proteinHits(body, 'fish').length
      checks.push({
        name: `${scenario.fastingWeekday} fasting respected`,
        ok: Boolean(fastDay) && mentionsFast && heavy === 0,
        detail: !fastDay
          ? 'weekday block missing'
          : mentionsFast
            ? 'fast/light pattern found'
            : 'Tuesday looks like a normal full chart',
      })
    }
  }

  return checks
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

async function cleanupFromReport(): Promise<void> {
  const reportPath = resolveReportPath()
  if (!existsSync(reportPath)) {
    console.error('No report file found at', reportPath)
    process.exit(1)
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    clients: Array<{ clientId: string; email: string }>
  }
  const admin = createAdminClient()
  let deleted = 0
  for (const c of report.clients ?? []) {
    try {
      await admin.from('plans').delete().eq('client_id', c.clientId)
      await admin.from('profiles').delete().eq('id', c.clientId)
      await admin.auth.admin.deleteUser(c.clientId)
      deleted += 1
      console.log(`Deleted ${c.email}`)
    } catch (err) {
      console.error(`Failed delete ${c.email}`, err)
    }
  }
  console.log(`Cleanup done: ${deleted}/${report.clients?.length ?? 0}`)
}

function emptyResult(
  index: number,
  c: { clientId: string; email: string; name: string; scenario?: LifestyleScenario },
  error: string
): ClientResult {
  return {
    index,
    scenarioId: c.scenario?.id ?? null,
    scenarioLabel: c.scenario?.label ?? null,
    clientId: c.clientId,
    email: c.email,
    name: c.name,
    dietPreference: null,
    breakfast: null,
    lunch: null,
    dinner: null,
    timingBreakfast: null,
    timingLunch: null,
    timingDinner: null,
    favorites: null,
    disliked: null,
    allergies: null,
    whey: null,
    cookingAbility: null,
    planChars: 0,
    checks: [],
    passed: 0,
    failed: 1,
    error,
  }
}

async function main(): Promise<void> {
  if (hasFlag('cleanup')) {
    await cleanupFromReport()
    return
  }

  const useFinal = hasFlag('final')
  const useScenarios = hasFlag('scenarios') || useFinal
  const onlyId = argValue('only', '').trim()
  const scenarioPool = (useFinal ? finalSmokeScenarios() : LIFESTYLE_SCENARIOS).filter(
    (s) => !onlyId || s.id === onlyId
  )
  const defaultCount = useScenarios ? String(scenarioPool.length) : '20'
  const requested = Math.max(1, Number(argValue('count', defaultCount)) || Number(defaultCount))
  const count = useScenarios ? Math.min(requested, scenarioPool.length) : requested
  const concurrency = Math.max(1, Number(argValue('concurrency', '2')) || 2)
  const skipAi = hasFlag('skip-ai')
  const reportPath = resolveReportPath()

  console.log(
    `=== Lifestyle plan smoke: ${count} clients, concurrency=${concurrency}, skipAi=${skipAi}, scenarios=${useScenarios}, final=${useFinal} ===\n`
  )

  const coaches = await listCoachesForAssignment()
  const coachId = coaches[0]?.id ?? null
  if (coachId) console.log(`Assigning clients to coach: ${coaches[0]?.name ?? coachId}`)
  else console.log('No coach found — clients will be unassigned')

  const admin = createAdminClient()
  const created: Array<{
    clientId: string
    email: string
    name: string
    scenario?: LifestyleScenario
  }> = []

  for (let i = 0; i < count; i++) {
    const scenario = useScenarios ? scenarioPool[i] : undefined
    const account = await createFakeTrialClient(coachId, scenario?.form)
    created.push({
      clientId: account.userId,
      email: account.email,
      name: scenario?.form.name ?? account.email,
      scenario,
    })
    console.log(
      `Created ${i + 1}/${count}: ${account.email}${scenario ? ` [${scenario.id}] ${scenario.label}` : ''}`
    )
  }

  if (skipAi) {
    writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), clients: created }, null, 2))
    console.log(`\nCreated ${created.length} clients. Report: ${reportPath}`)
    return
  }

  const results = await mapPool(created, concurrency, async (c, index) => {
    const label = `#${index + 1} ${c.scenario?.id ?? c.email}`
    console.log(`\nGenerating diet for ${label}…`)
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', c.clientId).single()
    if (error || !profile) {
      return emptyResult(index + 1, c, error?.message ?? 'profile missing')
    }

    const onboarding = profile as OnboardingProfile
    const eating = onboarding.onboarding_data?.eatingPattern
    const diet = onboarding.onboarding_data?.diet

    try {
      const planResult = await generatePlan({
        profile: onboarding,
        actionId: 'initial_diet',
        validationMode: 'nutrition_focus',
        coachInstructions:
          'Generate a personalized diet plan. Obey diet preference and lifestyle from Hard Constraints. Never invent a random chart. Use THIS client\'s usual meals, times, occupation, and cooking reality.',
      })

      const form = generatedDietFormData(planResult.generatedPlan, c.clientId)
      const nutrition = form.nutrition_plan ?? ''

      await admin.from('plans').insert({
        client_id: c.clientId,
        coach_id: coachId,
        title: `Lifestyle smoke diet ${index + 1}${c.scenario ? ` — ${c.scenario.id}` : ''}`,
        nutrition_plan: nutrition,
        workout_plan: form.workout_plan || 'N/A',
        cardio_plan: form.cardio_plan || '',
        supplement_plan: form.supplement_plan || '',
        coach_notes: `Lifestyle smoke test batch ${new Date().toISOString()} ${c.scenario?.id ?? ''}`,
        version: 1,
        active: true,
      })

      const checks = scoreLifestyle(onboarding, nutrition, c.scenario)
      const passed = checks.filter((x) => x.ok).length
      const failed = checks.filter((x) => !x.ok).length
      console.log(`  ${label}: ${passed}/${checks.length} lifestyle checks passed`)

      return {
        index: index + 1,
        scenarioId: c.scenario?.id ?? null,
        scenarioLabel: c.scenario?.label ?? null,
        clientId: c.clientId,
        email: c.email,
        name: onboarding.name ?? c.name,
        dietPreference: onboarding.diet_preference ?? null,
        breakfast: eating?.breakfast ?? null,
        lunch: eating?.lunch ?? null,
        dinner: eating?.dinner ?? null,
        timingBreakfast: eating?.timings?.breakfast ?? null,
        timingLunch: eating?.timings?.lunch ?? null,
        timingDinner: eating?.timings?.dinner ?? null,
        favorites: diet?.favoriteFoods ?? null,
        disliked: diet?.foodsDisliked ?? null,
        allergies: diet?.allergies ?? null,
        whey: diet?.wheyProtein ?? null,
        cookingAbility: diet?.cookingAbility ?? null,
        planChars: nutrition.length,
        checks,
        passed,
        failed,
      } satisfies ClientResult
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ${label} FAILED: ${message}`)
      return {
        ...emptyResult(index + 1, c, message),
        name: onboarding.name ?? c.name,
        dietPreference: onboarding.diet_preference ?? null,
        breakfast: eating?.breakfast ?? null,
        lunch: eating?.lunch ?? null,
        dinner: eating?.dinner ?? null,
        timingBreakfast: eating?.timings?.breakfast ?? null,
        timingLunch: eating?.timings?.lunch ?? null,
        timingDinner: eating?.timings?.dinner ?? null,
        favorites: diet?.favoriteFoods ?? null,
        disliked: diet?.foodsDisliked ?? null,
        allergies: diet?.allergies ?? null,
        whey: diet?.wheyProtein ?? null,
        cookingAbility: diet?.cookingAbility ?? null,
      } satisfies ClientResult
    }
  })

  const failByCheck: Record<string, number> = {}
  for (const r of results) {
    for (const c of r.checks.filter((x) => !x.ok)) {
      failByCheck[c.name] = (failByCheck[c.name] ?? 0) + 1
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    count,
    concurrency,
    scenarios: useScenarios,
    clients: results,
    summary: {
      clients: results.length,
      generationErrors: results.filter((r) => r.error).length,
      totalChecks: results.reduce((n, r) => n + r.checks.length, 0),
      checksPassed: results.reduce((n, r) => n + r.passed, 0),
      checksFailed: results.reduce((n, r) => n + r.failed, 0),
      clientsFullyPassing: results.filter((r) => !r.error && r.failed === 0 && r.checks.length > 0).length,
      correctPlanPercent: Math.round(
        (results.filter((r) => !r.error && r.failed === 0 && r.checks.length > 0).length / Math.max(1, results.length)) *
          100
      ),
      failByCheck,
    },
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('\n=== SUMMARY ===')
  console.log(`Clients: ${report.summary.clients}`)
  console.log(`Generation errors: ${report.summary.generationErrors}`)
  console.log(`Lifestyle checks: ${report.summary.checksPassed}/${report.summary.totalChecks} passed`)
  console.log(`Clients fully passing: ${report.summary.clientsFullyPassing}/${report.summary.clients} (${report.summary.correctPlanPercent}%)`)
  console.log(`Report: ${reportPath}`)
  if (Object.keys(failByCheck).length) {
    console.log('\nWhere lifestyle was not followed (by check):')
    for (const [name, n] of Object.entries(failByCheck).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× ${name}`)
    }
  }
  console.log(
    `\nCleanup later with: npx tsx --env-file=.env.local.txt scripts/smoke-20-lifestyle-plans.ts --cleanup --final`
  )

  for (const r of results) {
    const status = r.error ? 'ERROR' : r.failed === 0 ? 'PASS' : 'PARTIAL'
    console.log(
      `\n${status} #${r.index} ${r.scenarioId ?? r.name} (${r.dietPreference}) — ${r.passed}/${r.checks.length || 0}`
    )
    if (r.error) console.log(`  error: ${r.error}`)
    for (const c of r.checks.filter((x) => !x.ok)) {
      console.log(`  FAIL ${c.name}: ${c.detail}`)
    }
  }

  if (report.summary.generationErrors > 0 || report.summary.clientsFullyPassing < report.summary.clients) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
