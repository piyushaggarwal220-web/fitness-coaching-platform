/**
 * Create 20 trial clients with randomized onboarding, generate real AI diet plans,
 * and score each plan against lifestyle / preference answers.
 *
 * Run:
 *   npx tsx --env-file=.env.local.txt scripts/smoke-20-lifestyle-plans.ts
 *
 * Options:
 *   --count=20          number of clients (default 20)
 *   --concurrency=2     parallel AI generations (default 2)
 *   --skip-ai           create clients only (no plan generation)
 *   --cleanup           delete the trial clients created in this run's report
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

process.env.AI_PLAN_PROVIDER = process.env.AI_PLAN_PROVIDER || 'claude'

type Check = { name: string; ok: boolean; detail: string }
type ClientResult = {
  index: number
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

const REPORT_PATH = join(process.cwd(), 'tmp-lifestyle-20-report.json')

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
  return needles.filter((n) => {
    const needle = normalize(n)
    if (!needle) return false
    if (needle.length <= 4) {
      return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(h)
    }
    return h.includes(needle)
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
    .filter((w) => !['with', 'and', 'from', 'side', 'bowl', 'small', 'toast', 'black'].includes(w))
}

function scoreLifestyle(profile: OnboardingProfile, dietText: string): Check[] {
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
  ] as const
  let timingHits = 0
  const timingDetails: string[] = []
  for (const [label, t] of timingFields) {
    const variants = timeVariants(t)
    const found = variants.some((v) => normalize(dietText).includes(normalize(v)))
    if (found) timingHits += 1
    timingDetails.push(`${label}=${t ?? '—'}(${found ? 'hit' : 'miss'})`)
  }
  checks.push({
    name: 'Meal timings reflected',
    ok: timingHits >= 2,
    detail: `${timingHits}/3 — ${timingDetails.join('; ')}`,
  })

  const mealSources = [eating?.breakfast, eating?.lunch, eating?.dinner, diet?.favoriteFoods]
  const keywords = mealSources.flatMap((s) => keywordHits(s ?? undefined))
  const unique = [...new Set(keywords)].slice(0, 20)
  const matched = unique.filter((k) => normalize(dietText).includes(k))
  const mealOk = unique.length === 0 || matched.length >= Math.min(2, unique.length)
  checks.push({
    name: 'Usual/favorite food themes present',
    ok: mealOk,
    detail:
      unique.length === 0
        ? 'no keywords'
        : `${matched.length}/${unique.length} keywords — matched: ${matched.slice(0, 8).join(', ') || 'none'}`,
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
  if (cooking === 'basic') {
    const fancy = containsAny(dietText, ['sous vide', 'degustation', 'emulsion', 'molecular'])
    checks.push({
      name: 'Cooking ability (basic)',
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
  if (!existsSync(REPORT_PATH)) {
    console.error('No report file found at', REPORT_PATH)
    process.exit(1)
  }
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as {
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

async function main(): Promise<void> {
  if (hasFlag('cleanup')) {
    await cleanupFromReport()
    return
  }

  const count = Math.max(1, Number(argValue('count', '20')) || 20)
  const concurrency = Math.max(1, Number(argValue('concurrency', '2')) || 2)
  const skipAi = hasFlag('skip-ai')

  console.log(`=== Lifestyle plan smoke: ${count} clients, concurrency=${concurrency}, skipAi=${skipAi} ===\n`)

  const coaches = await listCoachesForAssignment()
  const coachId = coaches[0]?.id ?? null
  if (coachId) console.log(`Assigning clients to coach: ${coaches[0]?.name ?? coachId}`)
  else console.log('No coach found — clients will be unassigned')

  const admin = createAdminClient()
  const created: Array<{ clientId: string; email: string; name: string }> = []

  for (let i = 0; i < count; i++) {
    const account = await createFakeTrialClient(coachId)
    created.push({
      clientId: account.userId,
      email: account.email,
      name: account.email,
    })
    console.log(`Created ${i + 1}/${count}: ${account.email}`)
  }

  if (skipAi) {
    writeFileSync(REPORT_PATH, JSON.stringify({ createdAt: new Date().toISOString(), clients: created }, null, 2))
    console.log(`\nCreated ${created.length} clients. Report: ${REPORT_PATH}`)
    return
  }

  const results = await mapPool(created, concurrency, async (c, index) => {
    const label = `#${index + 1} ${c.email}`
    console.log(`\nGenerating diet for ${label}…`)
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', c.clientId).single()
    if (error || !profile) {
      return {
        index: index + 1,
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
        error: error?.message ?? 'profile missing',
      } satisfies ClientResult
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
          'Generate a personalized diet plan. Obey diet preference and lifestyle from Hard Constraints. Never invent a random chart.',
      })

      const form = generatedDietFormData(planResult.generatedPlan, c.clientId)
      const nutrition = form.nutrition_plan ?? ''

      await admin.from('plans').insert({
        client_id: c.clientId,
        coach_id: coachId,
        title: `Lifestyle smoke diet ${index + 1}`,
        nutrition_plan: nutrition,
        workout_plan: form.workout_plan || 'N/A',
        cardio_plan: form.cardio_plan || '',
        supplement_plan: form.supplement_plan || '',
        coach_notes: `Lifestyle smoke test batch ${new Date().toISOString()}`,
        version: 1,
        active: true,
      })

      const checks = scoreLifestyle(onboarding, nutrition)
      const passed = checks.filter((x) => x.ok).length
      const failed = checks.filter((x) => !x.ok).length
      console.log(`  ${label}: ${passed}/${checks.length} lifestyle checks passed`)

      return {
        index: index + 1,
        clientId: c.clientId,
        email: c.email,
        name: onboarding.name ?? c.email,
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
        index: index + 1,
        clientId: c.clientId,
        email: c.email,
        name: onboarding.name ?? c.email,
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
        planChars: 0,
        checks: [],
        passed: 0,
        failed: 1,
        error: message,
      } satisfies ClientResult
    }
  })

  const report = {
    createdAt: new Date().toISOString(),
    count,
    concurrency,
    clients: results,
    summary: {
      clients: results.length,
      generationErrors: results.filter((r) => r.error).length,
      totalChecks: results.reduce((n, r) => n + r.checks.length, 0),
      checksPassed: results.reduce((n, r) => n + r.passed, 0),
      checksFailed: results.reduce((n, r) => n + r.failed, 0),
      clientsFullyPassing: results.filter((r) => !r.error && r.failed === 0 && r.checks.length > 0).length,
    },
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))

  console.log('\n=== SUMMARY ===')
  console.log(`Clients: ${report.summary.clients}`)
  console.log(`Generation errors: ${report.summary.generationErrors}`)
  console.log(`Lifestyle checks: ${report.summary.checksPassed}/${report.summary.totalChecks} passed`)
  console.log(`Clients fully passing: ${report.summary.clientsFullyPassing}/${report.summary.clients}`)
  console.log(`Report: ${REPORT_PATH}`)
  console.log('\nCleanup later with: npx tsx --env-file=.env.local.txt scripts/smoke-20-lifestyle-plans.ts --cleanup')

  for (const r of results) {
    const status = r.error ? 'ERROR' : r.failed === 0 ? 'PASS' : 'PARTIAL'
    console.log(
      `\n${status} #${r.index} ${r.name} (${r.dietPreference}) — ${r.passed}/${r.checks.length || 0}`
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
