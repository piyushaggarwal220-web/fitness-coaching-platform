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
 *   --diet-only         generate diet only (skip workout)
 *   --edit-smoke        after diet, rewrite with a coach food-swap instruction
 *   --only=id,id        run named lifestyle scenarios
 *   --cleanup           delete the trial clients created in this run's report
 *   --report=file.json  report path (default tmp-lifestyle-20-report.json)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  createFakeTrialClient,
  listCoachesForAssignment,
} from '../src/lib/admin/testing-accounts'
import { coachAcceptsAutoAssignment } from '../src/lib/coach-delivery-policy'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { editPlanSection } from '../src/lib/ai/edit-plan-section'
import {
  dietTextHasCalorieConflict,
  inferMacrosFromDietText,
  parseHeaderCalories,
} from '../src/lib/ai/nutrition-macro-sync'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import { resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import { getAuthoritativeNutritionCalories } from '../src/lib/ai/nutrition-macro-sync'
import { resolveDietFloorKcal } from '../src/lib/ai/plan-quality-rules'
import {
  buildTrackerSnapshot,
  isCoachingExerciseName,
} from '../src/lib/daily-tracker/parser'
import type { TrackerMealItem, TrackerWorkoutItem } from '../src/lib/daily-tracker/types'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { OnboardingProfile, Plan } from '../src/types/database'
import { auditWorkout } from './audit-tracker-workout-gold'
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
  kcal: number | null
  preferredKcal: number | null
  floorKcal: number | null
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
    const variety = profile.onboarding_data?.lifestyle?.dietVariety
    if ((scenario.varietyDaily || variety === 'different_daily' || variety === 'fifty_fifty') && days.length >= 5) {
      const unique = new Set(days.map((d) => normalize(d.body).replace(/daily totals?:.*/gi, ''))).size
      checks.push({
        name: 'Variety preference (days must not all match)',
        ok: unique >= (variety === 'fifty_fifty' ? 3 : 4),
        detail: `${unique}/${days.length} distinct day bodies`,
      })
    } else if (!scenario.sameDaily && variety !== 'same_daily' && days.length >= 5) {
      const unique = new Set(days.map((d) => normalize(d.body).replace(/daily totals?:.*/gi, ''))).size
      checks.push({
        name: 'Did not clone one day across the week',
        ok: unique > 1,
        detail: unique <= 1 ? 'all days identical' : `${unique} distinct days`,
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

  checks.push(...scoreCalorieConsistency(dietText))
  return checks
}

function scoreCalorieConsistency(dietText: string): Check[] {
  const header = parseHeaderCalories(dietText)
  const inferred = inferMacrosFromDietText(dietText)
  const fillHits = dietText.match(/\(calorie fill\)/gi) ?? []
  const lateSnackDumps = dietText.match(/Late snack:/gi) ?? []
  return [
    {
      name: 'No calorie-fill labels',
      ok: fillHits.length === 0,
      detail: fillHits.length ? `${fillHits.length} "(calorie fill)" labels` : 'ok',
    },
    {
      name: 'Header matches plan calories',
      ok: !dietTextHasCalorieConflict(dietText),
      detail: `header ${header ?? '—'} vs food ${inferred?.calories ?? '—'}`,
    },
    {
      name: 'Did not dump identical late-snack calorie pads',
      ok: lateSnackDumps.length === 0,
      detail: lateSnackDumps.length ? `${lateSnackDumps.length} Late snack lines` : 'ok',
    },
  ]
}

function scoreEditRemoval(dietText: string): Check[] {
  const days = splitDays(dietText)
  const targets = ['tuesday', 'thursday'] as const
  return targets.map((weekday) => {
    const day = days.find((d) => d.weekday === weekday)
    const chicken = day ? proteinHits(day.body, 'chicken') : ['day missing']
    const eggs = day ? proteinHits(day.body, 'egg') : ['day missing']
    const leftover = [...chicken, ...eggs]
    return {
      name: `Edit removed chicken/eggs on ${weekday}`,
      ok: Boolean(day) && leftover.length === 0,
      detail: leftover.length ? leftover.join(', ') : 'ok',
    }
  })
}

function scoreCalories(
  profile: OnboardingProfile,
  nutrition: string,
  scenario?: LifestyleScenario
): Check[] {
  const targets = resolveClientCalorieTargets(profile)
  const preferred = targets?.preferred ?? resolveDietFloorKcal(profile.weight)
  const floor = targets?.floorKcal ?? resolveDietFloorKcal(profile.weight)
  const skipWeekdays = scenario?.fastingWeekday ? [scenario.fastingWeekday] : []
  const cals = getAuthoritativeNutritionCalories(
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      meals: [{ example: nutrition }],
    },
    { skipWeekdays }
  )
  const delta = cals - preferred
  const onFloorWhileTargetHigher =
    Math.abs(cals - floor) <= 40 && preferred > floor + 120
  const ok =
    Number.isFinite(cals) &&
    cals > 0 &&
    Math.abs(delta) <= 120 &&
    !onFloorWhileTargetHigher
  return [
    {
      name: 'Calories match Mifflin target',
      ok,
      detail: `plan ${cals} vs Mifflin ${preferred} (maintenance ${targets?.maintenance ?? '—'}, floor ${floor}, delta ${delta}${skipWeekdays.length ? `, skip ${skipWeekdays.join(',')}` : ''}${onFloorWhileTargetHigher ? ', landed on floor' : ''})`,
    },
  ]
}

function countWrittenMealHeaders(diet: string): number {
  const re =
    /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?(?:[A-Za-z][A-Za-z-]*\s+){0,4}(?:breakfast|lunch|dinner|snack|late snack|evening snack|mid[- ]?morning|morning meal|evening meal|pre[- ]?workout|post[- ]?workout)\b/gi
  return [...diet.matchAll(re)].length
}

function scoreTracker(
  profile: OnboardingProfile,
  scenario: LifestyleScenario | undefined,
  nutrition: string,
  workout: string
): Check[] {
  const now = new Date().toISOString()
  const plan: Plan = {
    id: 'smoke-tracker',
    client_id: profile.id,
    coach_id: profile.coach_id ?? '',
    title: 'Tracker smoke',
    phase: 'Phase 1',
    nutrition_plan: nutrition,
    workout_plan: workout,
    cardio_plan: '',
    supplement_plan: '',
    coach_notes: 'Drink 3L water. Bed by 10:30 PM.',
    version: 1,
    active: true,
    delivered_at: now,
    updated_at: now,
    created_at: now,
  }
  const snap = buildTrackerSnapshot(plan, profile)
  const meals = snap.items.filter((i) => i.type === 'meal')
  const workouts = snap.items.filter((i) => i.type === 'workout')
  const training = workouts.filter((w) => w.type === 'workout' && w.exercises.length > 0)
  const exercises = training.flatMap((w) => (w.type === 'workout' ? w.exercises : []))
  const dietDays = new Set((snap.dietDays ?? []).map((d) => d.key)).size
  const workoutDays = new Set((snap.workoutDays ?? []).map((d) => d.key)).size
  const checks: Check[] = []

  checks.push({
    name: 'Tracker diet days (unique)',
    ok: dietDays >= 7,
    detail: `${dietDays} unique diet days, ${meals.length} meals`,
  })

  const mealsPerDay = new Map<string, number>()
  for (const m of meals) {
    if (m.type !== 'meal') continue
    const key = m.dietDay ?? 'default'
    mealsPerDay.set(key, (mealsPerDay.get(key) ?? 0) + 1)
  }
  const minMeals = scenario?.skipLunch || scenario?.skipBreakfast ? 1 : 2
  const thinDays = [...mealsPerDay.entries()].filter(([key, n]) => {
    const need = scenario?.fastingWeekday && key === scenario.fastingWeekday ? 1 : minMeals
    return n < need
  })
  checks.push({
    name: 'Tracker meals match the written diet',
    ok: meals.length >= 10 && thinDays.length === 0,
    detail:
      thinDays.length > 0
        ? `thin days: ${thinDays.map(([k, n]) => `${k}=${n}`).join(', ')}`
        : `${meals.length} meals across ${mealsPerDay.size} days`,
  })

  const emptyFoods = meals.filter((m) => m.type === 'meal' && !m.foods.trim())
  checks.push({
    name: 'Tracker meal foods are not empty',
    ok: emptyFoods.length === 0,
    detail: emptyFoods.length ? `${emptyFoods.length} empty` : 'ok',
  })

  checks.push({
    name: 'Tracker workout days (unique, not duplicated)',
    ok: workoutDays >= 4 && workoutDays <= 8,
    detail: `${workoutDays} unique workout days, ${training.length} training sessions`,
  })

  const skinny = training.filter((w) => w.type === 'workout' && w.exercises.length < 4)
  checks.push({
    name: 'Tracker training days have real exercises',
    ok: training.length >= 3 && skinny.length === 0,
    detail:
      skinny.length > 0
        ? skinny
            .map((w) =>
              w.type === 'workout' ? `${w.dayLabel ?? w.title}:${w.exercises.length}` : ''
            )
            .join('; ')
        : `${training.length} sessions / ${exercises.length} exercises`,
  })

  const coachingNames = exercises.filter((e) => isCoachingExerciseName(e.name))
  checks.push({
    name: 'Tracker exercise names are lifts not coaching prose',
    ok: coachingNames.length === 0,
    detail: coachingNames.length ? coachingNames.map((e) => e.name).slice(0, 5).join(', ') : 'ok',
  })

  const water = snap.items.find((i) => i.type === 'water')
  checks.push({
    name: 'Water tracker present',
    ok: Boolean(water && water.type === 'water' && water.targetMl > 0),
    detail: water && water.type === 'water' ? `${water.targetMl} ml` : 'missing',
  })
  checks.push({
    name: 'Sleep tracker present',
    ok: snap.items.some((i) => i.type === 'sleep'),
    detail: snap.items.some((i) => i.type === 'sleep') ? 'ok' : 'missing',
  })

  const writtenMealHeaders = countWrittenMealHeaders(nutrition)
  checks.push({
    name: 'Tracker meal count matches written diet headers',
    ok: writtenMealHeaders === 0 || (meals.length >= 10 && Math.abs(meals.length - writtenMealHeaders) <= 4),
    detail: `written headers ${writtenMealHeaders} vs tracker meals ${meals.length}`,
  })

  if (scenario?.mustInclude.length) {
    const trackerFoods = meals
      .filter((m): m is TrackerMealItem => m.type === 'meal')
      .map((m) => m.foods)
      .join('\n')
    const hits = scenario.mustInclude.filter((n) => normalize(trackerFoods).includes(normalize(n)))
    const need = Math.min(2, scenario.mustInclude.length)
    checks.push({
      name: 'Tracker meal foods include lifestyle staples',
      ok: hits.length >= need,
      detail:
        hits.length >= need
          ? `hit ${hits.join(', ')}`
          : `need ${need} of [${scenario.mustInclude.join(', ')}], got ${hits.join(', ') || 'none'}`,
    })
  }

  const workoutItems = workouts.filter((w): w is TrackerWorkoutItem => w.type === 'workout')
  if (workout.trim() && workout.trim() !== 'N/A') {
    const gold = auditWorkout(workout, workoutItems, snap.workoutDays?.length ?? 0)
    const missing = gold.issues.reduce((n, i) => n + i.missing.length, 0)
    const extra = gold.issues.reduce((n, i) => n + i.extra.length, 0)
    const coaching = gold.issues.reduce((n, i) => n + i.coaching.length, 0)
    checks.push({
      name: 'Workout tracker gold-diff vs written lifts',
      ok: missing === 0 && extra === 0 && coaching === 0,
      detail:
        missing === 0 && extra === 0 && coaching === 0
          ? `${gold.writtenDays} written days / ${gold.trackerDays} tracker days`
          : gold.issues
              .slice(0, 5)
              .map((i) => {
                const bits = [
                  i.missing.length ? `miss ${i.missing.slice(0, 3).join(', ')}` : '',
                  i.extra.length ? `extra ${i.extra.slice(0, 3).join(', ')}` : '',
                  i.coaching.length ? `coaching ${i.coaching.slice(0, 2).join(', ')}` : '',
                ].filter(Boolean)
                return `${i.day}: ${bits.join('; ')}`
              })
              .join(' | '),
    })

    const trainingMains = workoutItems.filter(
      (w) =>
        !/\brest\b/i.test(`${w.focus ?? ''} ${w.title}`) &&
        (w.phases?.some((p) => p.phase === 'main' && p.exercises.length > 0) ||
          w.exercises.filter((e) => e.phase === 'main').length > 0)
    )
    const warmupLeaks = trainingMains.filter((w) => {
      const mains = (w.phases?.find((p) => p.phase === 'main')?.exercises ?? w.exercises.filter((e) => e.phase === 'main'))
        .map((e) => e.name)
      return mains.some((n) => /\b(stretch|arm circles|leg swings|wrist circles)\b/i.test(n))
    })
    checks.push({
      name: 'Workout tracker keeps stretches out of Main',
      ok: warmupLeaks.length === 0,
      detail:
        warmupLeaks.length === 0
          ? `${trainingMains.length} training days with a Main list`
          : warmupLeaks
              .slice(0, 3)
              .map((w) => w.workoutDay ?? w.dayLabel ?? w.title)
              .join(', '),
    })

    const allowedDays = (profile.onboarding_data?.training?.availableDays ?? [])
      .map((d) => String(d).toLowerCase())
      .filter(Boolean)
    if (allowedDays.length > 0) {
      const allowed = new Set(allowedDays)
      const trainingDayKeys = trainingMains
        .map((w) => (w.workoutDay ?? '').toLowerCase())
        .filter(Boolean)
      const offDays = [...new Set(trainingDayKeys.filter((d) => !allowed.has(d)))]
      const missingDays = allowedDays.filter((d) => !trainingDayKeys.includes(d))
      checks.push({
        name: 'Workouts only on selected weekdays',
        ok: offDays.length === 0 && missingDays.length === 0,
        detail:
          offDays.length === 0 && missingDays.length === 0
            ? `training on ${allowedDays.join(', ')}`
            : [
                offDays.length ? `trained off-day ${offDays.join(', ')}` : '',
                missingDays.length ? `missing ${missingDays.join(', ')}` : '',
              ]
                .filter(Boolean)
                .join('; '),
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
      await admin.from('daily_tracker_days').delete().eq('client_id', c.clientId)
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
    kcal: null,
    preferredKcal: null,
    floorKcal: null,
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
  const onlyIds = argValue('only', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const scenarioPool = (useFinal ? finalSmokeScenarios() : LIFESTYLE_SCENARIOS).filter(
    (s) => onlyIds.length === 0 || onlyIds.includes(s.id)
  )
  const defaultCount = useScenarios ? String(scenarioPool.length) : '20'
  const requested = Math.max(1, Number(argValue('count', defaultCount)) || Number(defaultCount))
  const count = useScenarios ? Math.min(requested, scenarioPool.length) : requested
  const concurrency = Math.max(1, Number(argValue('concurrency', '2')) || 2)
  const complete = !hasFlag('diet-only') && (hasFlag('complete') || hasFlag('scenarios'))
  const skipAi = hasFlag('skip-ai')
  const editSmoke = hasFlag('edit-smoke')
  const reportPath = resolveReportPath()

  console.log(
    `=== Lifestyle plan smoke: ${count} clients, concurrency=${concurrency}, skipAi=${skipAi}, scenarios=${useScenarios}, final=${useFinal}, complete=${complete}, editSmoke=${editSmoke} ===\n`
  )

  const coaches = await listCoachesForAssignment()
  const planCoachId = coaches.find((c) => coachAcceptsAutoAssignment(c.id))?.id ?? null
  const coachId = null
  console.log('Trial smoke clients stay unassigned so they never appear on a coach roster')
  if (planCoachId) console.log(`Persisting generated plans under coach FK ${planCoachId}`)

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
    console.log(`\nGenerating ${complete ? 'diet+workout' : 'diet'} for ${label}…`)
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
      let nutrition = form.nutrition_plan ?? ''
      let workout = form.workout_plan || ''

      if (editSmoke && nutrition.trim()) {
        console.log(`  Editing diet for ${label} (remove chicken/eggs Tue+Thu)…`)
        const edited = await editPlanSection({
          section: 'nutrition',
          currentText: nutrition,
          coachInstruction: 'please remove chicken and eggs from thursday diet tuesday also',
          editSource: 'coach',
          clientName: onboarding.name,
          clientId: c.clientId,
          profile: onboarding,
        })
        nutrition = edited.revisedText
      }

      if (complete) {
        const workoutResult = await generatePlan({
          profile: onboarding,
          actionId: 'initial_workout',
          validationMode: 'workout_focus',
          coachInstructions:
            'Generate a personalized workout plan. Label each training day as Day N (Weekday). Real exercise names with sets and reps. Do not repeat the same day header twice.',
        })
        workout = generatedWorkoutFormData(workoutResult.generatedPlan, c.clientId).workout_plan ?? workout
      }

      if (planCoachId) {
        await admin.from('plans').insert({
          client_id: c.clientId,
          coach_id: planCoachId,
          title: `Lifestyle smoke ${index + 1}${c.scenario ? ` — ${c.scenario.id}` : ''}`,
          nutrition_plan: nutrition,
          workout_plan: workout || 'N/A',
          cardio_plan: form.cardio_plan || '',
          supplement_plan: form.supplement_plan || '',
          coach_notes: `Lifestyle smoke test batch ${new Date().toISOString()} ${c.scenario?.id ?? ''}`,
          version: 1,
          active: true,
        })
      }

      const targets = resolveClientCalorieTargets(onboarding)
      const kcal = getAuthoritativeNutritionCalories(
        {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          meals: [{ example: nutrition }],
        },
        { skipWeekdays: c.scenario?.fastingWeekday ? [c.scenario.fastingWeekday] : [] }
      )
      const checks = [
        ...scoreLifestyle(onboarding, nutrition, c.scenario),
        ...scoreCalories(onboarding, nutrition, c.scenario),
        ...(editSmoke ? scoreEditRemoval(nutrition) : []),
        ...(complete ? scoreTracker(onboarding, c.scenario, nutrition, workout) : []),
      ]
      const passed = checks.filter((x) => x.ok).length
      const failed = checks.filter((x) => !x.ok).length
      console.log(
        `  ${label}: ${passed}/${checks.length} checks passed · kcal ${kcal} vs Mifflin ${targets?.preferred ?? '—'}`
      )

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
        kcal,
        preferredKcal: targets?.preferred ?? null,
        floorKcal: targets?.floorKcal ?? null,
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
