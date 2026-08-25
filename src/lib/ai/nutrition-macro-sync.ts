import type { GeneratedNutritionPlan } from '@/lib/ai/generate-plan'
import {
  DIET_FLOOR_HARD_KCAL,
  DIET_FLOOR_TARGET_KCAL,
} from '@/lib/ai/plan-quality-rules'

export { DIET_FLOOR_TARGET_KCAL }

type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

const MEAL_MACRO_LINE =
  /\(P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g\s*\|\s*~?\s*(\d+)\s*kcal\)/gi

const DAILY_SUMMARY_LINE =
  /~?\s*(\d{3,4})\s*kcal\s*\|\s*(\d+)\s*g\s*protein\s*\|\s*(\d+)\s*g\s*carbs\s*\|\s*(\d+)\s*g\s*fat/gi

/** "Daily averages: ~1850 kcal | P: 95g | C: 200g | F: 55g" */
const DAILY_P_SUMMARY_LINE =
  /daily\s+(?:total|totals|average|averages)\s*:?\s*~?\s*(\d{3,4})\s*kcal\s*\|\s*P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g/gi

function isDailyTotalOrAverageLine(line: string): boolean {
  return /daily\s+(?:total|totals|average|averages)/i.test(line)
}

function isNewMealOrDayHeader(line: string): boolean {
  const t = line.replace(/^\*{1,2}|#{1,3}\s*/, '').trim()
  if (!t) return false
  if (/^(?:day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) {
    return true
  }
  return /^(breakfast|lunch|dinner|snack|late snack|evening snack|mid[- ]?morning|morning meal|evening meal|pre[- ]?workout|post[- ]?workout)\b/i.test(
    t
  )
}

const HEADER_CALORIES = /calories:\s*(\d+)/i
const HEADER_PROTEIN = /protein:\s*(\d+)\s*g/i
const HEADER_CARBS = /carbs:\s*(\d+)\s*g/i
const HEADER_FAT = /fat:\s*(\d+)\s*g/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mealText(meal: unknown): string {
  if (!isRecord(meal)) return ''
  const parts = [meal.example, meal.description, meal.content, meal.meal, meal.name]
  return parts
    .filter((p): p is string => typeof p === 'string')
    .join('\n')
}

function collectDietProse(meals: unknown[]): string {
  return meals.map(mealText).filter(Boolean).join('\n\n')
}

function averageMacros(totals: MacroTotals[]): MacroTotals | null {
  if (totals.length === 0) return null
  const sum = totals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
  const n = totals.length
  return {
    calories: Math.round(sum.calories / n),
    protein: Math.round(sum.protein / n),
    carbs: Math.round(sum.carbs / n),
    fat: Math.round(sum.fat / n),
  }
}

function parseMealMacroLines(text: string): MacroTotals[] {
  const perMeal: MacroTotals[] = []
  const lines = text.split(/\r?\n/)
  let acceptNextMacro = true
  for (const line of lines) {
    if (isNewMealOrDayHeader(line)) acceptNextMacro = true
    if (isDailyTotalOrAverageLine(line)) continue
    const pattern = new RegExp(MEAL_MACRO_LINE.source, 'gi')
    const match = pattern.exec(line)
    if (!match) continue
    if (!acceptNextMacro) continue
    perMeal.push({
      protein: parseInt(match[1]!, 10),
      carbs: parseInt(match[2]!, 10),
      fat: parseInt(match[3]!, 10),
      calories: parseInt(match[4]!, 10),
    })
    acceptNextMacro = false
  }
  return perMeal
}

function parseDailySummaryLines(text: string): MacroTotals[] {
  const daily: MacroTotals[] = []
  const push = (calories: string, protein: string, carbs: string, fat: string) => {
    daily.push({
      calories: parseInt(calories, 10),
      protein: parseInt(protein, 10),
      carbs: parseInt(carbs, 10),
      fat: parseInt(fat, 10),
    })
  }

  let match: RegExpExecArray | null
  const pFormat = new RegExp(DAILY_P_SUMMARY_LINE.source, 'gi')
  while ((match = pFormat.exec(text)) !== null) {
    push(match[1]!, match[2]!, match[3]!, match[4]!)
  }

  const proteinWord = new RegExp(DAILY_SUMMARY_LINE.source, 'gi')
  while ((match = proteinWord.exec(text)) !== null) {
    const around = text.slice(Math.max(0, match.index - 40), match.index + match[0].length)
    if (isDailyTotalOrAverageLine(around) && /P:\s*\d+/i.test(around)) continue
    push(match[1]!, match[2]!, match[3]!, match[4]!)
  }

  for (const line of text.split(/\r?\n/)) {
    if (!isDailyTotalOrAverageLine(line)) continue
    if (/daily\s+(?:total|totals|average|averages)\s*:?\s*~?\s*\d{3,4}\s*kcal\s*\|\s*P:/i.test(line)) {
      continue
    }
    const mealShape = new RegExp(MEAL_MACRO_LINE.source, 'i').exec(line)
    if (!mealShape) continue
    push(mealShape[4]!, mealShape[1]!, mealShape[2]!, mealShape[3]!)
  }

  return daily
}

function sumByDay(mealMacros: MacroTotals[]): MacroTotals | null {
  if (mealMacros.length === 0) return null

  const total = mealMacros.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  // Weekly plans: ~3-5 meals/day × 7 days — divide total by 7 for daily average
  const divisor = mealMacros.length >= 14 ? 7 : 1
  return {
    calories: Math.round(total.calories / divisor),
    protein: Math.round(total.protein / divisor),
    carbs: Math.round(total.carbs / divisor),
    fat: Math.round(total.fat / divisor),
  }
}

/** Infer daily macro averages from diet plan prose. */
export function inferMacrosFromDietText(text: string): MacroTotals | null {
  const dailySummaries = parseDailySummaryLines(text)
  if (dailySummaries.length > 0) {
    return averageMacros(dailySummaries)
  }

  const mealMacros = parseMealMacroLines(text)
  if (mealMacros.length > 0) {
    return sumByDay(mealMacros)
  }

  const headerCal = text.match(HEADER_CALORIES)
  if (headerCal && parseInt(headerCal[1]!, 10) > 0) {
    return {
      calories: parseInt(headerCal[1]!, 10),
      protein: parseInt(text.match(HEADER_PROTEIN)?.[1] ?? '0', 10),
      carbs: parseInt(text.match(HEADER_CARBS)?.[1] ?? '0', 10),
      fat: parseInt(text.match(HEADER_FAT)?.[1] ?? '0', 10),
    }
  }

  return null
}

/** Plausible daily-intake range — used so we never rewrite a "400 calorie deficit" style number. */
const MIN_DAILY_KCAL = 1000
const MAX_DAILY_KCAL = 5000
/** Tolerance before a conversational calorie claim is treated as a mismatch and rewritten. */
const KCAL_MISMATCH_TOLERANCE = 40

/** Hard cap on week-to-week daily-calorie change (400 kcal rule + rounding headroom). */
const MAX_WEEKLY_KCAL_JUMP = 450

/** Read the "Calories: NNNN" header from a stored plan's nutrition string. */
export function parseHeaderCalories(text: string | null | undefined): number | null {
  if (!text) return null
  const match = text.match(HEADER_CALORIES)
  if (!match) return null
  const value = parseInt(match[1]!, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

export type DietSafetyResult = { ok: true } | { ok: false; error: string; hint: string }

/**
 * Enforce the non-negotiable diet numbers AFTER generation: at least the floor, and no large
 * week-to-week calorie swing. Returns a retry hint on violation so the model must fix it.
 */
export function enforceDietSafety(
  plan: GeneratedNutritionPlan,
  opts: { previousCalories?: number | null } = {}
): DietSafetyResult {
  const cals = plan.calories
  if (typeof cals !== 'number' || !Number.isFinite(cals) || cals <= 0) {
    return { ok: true } // consistency layer already guards missing totals
  }

  if (cals < DIET_FLOOR_HARD_KCAL) {
    return {
      ok: false,
      error: `Diet daily calories ${cals} are below the ${DIET_FLOOR_TARGET_KCAL} kcal floor.`,
      hint:
        `The daily average came out to about ${cals} kcal, which is below the ${DIET_FLOOR_TARGET_KCAL} kcal floor. ` +
        `Rebuild all 7 days with more food so the daily average is at least ${DIET_FLOOR_TARGET_KCAL} kcal. ` +
        `Do not cut calories to hit protein. If a lower intake seemed indicated, still stay at ${DIET_FLOOR_TARGET_KCAL}+ and flag the coach. ` +
        'Never program a crash diet, and keep any deficit within 400 kcal of maintenance.',
    }
  }

  const prev = opts.previousCalories
  if (typeof prev === 'number' && prev > 0) {
    const jump = Math.abs(cals - prev)
    if (jump > MAX_WEEKLY_KCAL_JUMP) {
      const direction = cals > prev ? 'increase' : 'decrease'
      return {
        ok: false,
        error: `Weekly calorie ${direction} of ${jump} kcal (${prev} → ${cals}) exceeds the ${MAX_WEEKLY_KCAL_JUMP} kcal limit.`,
        hint:
          `Last week averaged about ${prev} kcal/day and this draft is about ${cals} kcal/day — a ${jump} kcal ${direction}. ` +
          'Do not make large week-to-week calorie swings. ' +
          `Keep the new daily average within ${MAX_WEEKLY_KCAL_JUMP} kcal of ${prev} unless a clear medical reason requires otherwise.`,
      }
    }
  }

  return { ok: true }
}

/** Lines that ARE the source of truth (meal macro lines / daily totals) must never be rewritten. */
function isSourceOfTruthLine(line: string): boolean {
  if (new RegExp(MEAL_MACRO_LINE.source, 'i').test(line)) return true
  if (new RegExp(DAILY_SUMMARY_LINE.source, 'i').test(line)) return true
  return /daily\s+(total|totals|average|averages)/i.test(line)
}

/**
 * Rewrite conversational daily-calorie claims (e.g. "I'm giving you 1700 calories this week")
 * so they match the authoritative food-derived total. Meal macro lines and daily total/average
 * lines are treated as the source of truth and left untouched. Numbers outside a plausible daily
 * range (deficits, protein grams, etc.) are ignored.
 */
export function reconcileDietProseCalories(text: string, targetCalories: number): string {
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) return text

  const calorieClaim = /(\d[\d,]{2,4})(\s*(?:k?cal\b|calories?\b))/gi

  return text
    .split('\n')
    .map((line) => {
      if (isSourceOfTruthLine(line)) return line
      return line.replace(calorieClaim, (match, digits: string, unit: string) => {
        const value = parseInt(digits.replace(/,/g, ''), 10)
        if (!Number.isFinite(value)) return match
        if (value < MIN_DAILY_KCAL || value > MAX_DAILY_KCAL) return match
        if (Math.abs(value - targetCalories) <= KCAL_MISMATCH_TOLERANCE) return match
        return `${targetCalories}${unit}`
      })
    })
    .join('\n')
}

/**
 * Detects the "header says 1450 but the text says 1700" bug in an already-stored diet plan.
 * Used to force a fresh AI generation instead of carrying a broken plan forward on a stable week.
 */
export function dietTextHasCalorieConflict(text: string | null | undefined): boolean {
  if (!text?.trim()) return false

  const inferred = inferMacrosFromDietText(text)
  if (!inferred || inferred.calories <= 0) return false

  const mealLines = parseMealMacroLines(text)
  const dailyLines = parseDailySummaryLines(text)
  // Only food-derived totals are trustworthy enough to judge a conflict.
  if (mealLines.length === 0 && dailyLines.length === 0) return false

  const header = text.match(HEADER_CALORIES)
  if (header) {
    const headerCalories = parseInt(header[1]!, 10)
    if (
      Number.isFinite(headerCalories) &&
      headerCalories > 0 &&
      Math.abs(headerCalories - inferred.calories) > KCAL_MISMATCH_TOLERANCE
    ) {
      return true
    }
  }

  const calorieClaim = /(\d[\d,]{2,4})(\s*(?:k?cal\b|calories?\b))/gi
  for (const line of text.split('\n')) {
    if (isSourceOfTruthLine(line)) continue
    if (/^\s*calories:\s*\d+/i.test(line)) continue
    let match: RegExpExecArray | null
    const pattern = new RegExp(calorieClaim.source, 'gi')
    while ((match = pattern.exec(line)) !== null) {
      const value = parseInt(match[1]!.replace(/,/g, ''), 10)
      if (!Number.isFinite(value)) continue
      if (value < MIN_DAILY_KCAL || value > MAX_DAILY_KCAL) continue
      if (Math.abs(value - inferred.calories) > KCAL_MISMATCH_TOLERANCE) return true
    }
  }

  return false
}

function reconcileMealsProse(meals: unknown[], targetCalories: number): unknown[] {
  return meals.map((meal) => {
    if (!isRecord(meal)) return meal
    const next: Record<string, unknown> = { ...meal }
    for (const field of ['example', 'description', 'content'] as const) {
      const value = next[field]
      if (typeof value === 'string') {
        next[field] = reconcileDietProseCalories(value, targetCalories)
      }
    }
    return next
  })
}

/** Prefer macros summed from meal/day lines; never keep an inflated header when food totals exist. */
export function syncNutritionPlanMacros(plan: GeneratedNutritionPlan): GeneratedNutritionPlan {
  const prose = collectDietProse(plan.meals)
  const inferred = inferMacrosFromDietText(prose)
  if (!inferred || inferred.calories <= 0) return plan

  const mealLines = parseMealMacroLines(prose)
  const dailyLines = parseDailySummaryLines(prose)
  const trustFoodTotals = mealLines.length > 0 || dailyLines.length > 0

  if (trustFoodTotals) {
    return {
      ...plan,
      calories: inferred.calories,
      protein: inferred.protein,
      carbs: inferred.carbs,
      fat: inferred.fat,
      // Rewrite any conversational calorie claim in the prose to the food-derived total so the
      // narrative can never contradict the header ("1450 header / giving you 1700" bug).
      meals: reconcileMealsProse(plan.meals, inferred.calories),
    }
  }

  return {
    ...plan,
    calories: plan.calories > 0 ? plan.calories : inferred.calories,
    protein: plan.protein > 0 ? plan.protein : inferred.protein,
    carbs: plan.carbs > 0 ? plan.carbs : inferred.carbs,
    fat: plan.fat > 0 ? plan.fat : inferred.fat,
  }
}
