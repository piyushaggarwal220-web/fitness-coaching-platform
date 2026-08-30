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

/** When a client only swaps foods, keep daily calories within this band of the prior plan. */
export const EDIT_CALORIE_PRESERVE_TOLERANCE = 75

/**
 * Week-to-week calorie moves. Cuts are tighter than raises — a 2100 → 1780 drop
 * (320 kcal) used to pass a ±450 band and land on the floor, which clients feel as
 * "suddenly too low". Prefer gradual trims of ~100–200 kcal.
 */
export const MAX_WEEKLY_KCAL_INCREASE = 300
export const MAX_WEEKLY_KCAL_DECREASE = 200

function clampCaloriesToWeeklyBand(target: number, previous: number): number {
  const max = previous + MAX_WEEKLY_KCAL_INCREASE
  const min = Math.max(previous - MAX_WEEKLY_KCAL_DECREASE, DIET_FLOOR_TARGET_KCAL)
  return Math.min(Math.max(target, min), max)
}

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
    const delta = cals - prev
    if (delta > MAX_WEEKLY_KCAL_INCREASE) {
      return {
        ok: false,
        error: `Weekly calorie increase of ${delta} kcal (${prev} → ${cals}) exceeds the ${MAX_WEEKLY_KCAL_INCREASE} kcal limit.`,
        hint:
          `Last week averaged about ${prev} kcal/day and this draft is about ${cals} kcal/day — a ${delta} kcal increase. ` +
          `Raise gradually: keep the new daily average within ${MAX_WEEKLY_KCAL_INCREASE} kcal above ${prev}.`,
      }
    }
    if (delta < -MAX_WEEKLY_KCAL_DECREASE) {
      const drop = Math.abs(delta)
      const safeFloor = Math.max(prev - MAX_WEEKLY_KCAL_DECREASE, DIET_FLOOR_TARGET_KCAL)
      return {
        ok: false,
        error: `Weekly calorie decrease of ${drop} kcal (${prev} → ${cals}) exceeds the ${MAX_WEEKLY_KCAL_DECREASE} kcal limit.`,
        hint:
          `Last week averaged about ${prev} kcal/day and this draft is about ${cals} kcal/day — a ${drop} kcal cut. ` +
          `That is too sharp (example: do not jump from ~2100 down to ~1780). Trim at most ${MAX_WEEKLY_KCAL_DECREASE} kcal ` +
          `(stay at about ${safeFloor}+ kcal) and only after raising steps/training. Never drop to the ${DIET_FLOOR_TARGET_KCAL} floor just because protein was hard to hit.`,
      }
    }
  }

  return { ok: true }
}

function rewriteNutritionHeader(text: string, macros: MacroTotals): string {
  const lines = text.split('\n')
  let touchedCal = false
  let touchedP = false
  let touchedC = false
  let touchedF = false

  const mapped = lines.map((line) => {
    if (HEADER_CALORIES.test(line)) {
      touchedCal = true
      return `Calories: ${macros.calories}`
    }
    if (HEADER_PROTEIN.test(line)) {
      touchedP = true
      return `Protein: ${macros.protein}g`
    }
    if (HEADER_CARBS.test(line)) {
      touchedC = true
      return `Carbs: ${macros.carbs}g`
    }
    if (HEADER_FAT.test(line)) {
      touchedF = true
      return `Fat: ${macros.fat}g`
    }
    return line
  })

  const prefix: string[] = []
  if (!touchedCal) prefix.push(`Calories: ${macros.calories}`)
  if (!touchedP) prefix.push(`Protein: ${macros.protein}g`)
  if (!touchedC) prefix.push(`Carbs: ${macros.carbs}g`)
  if (!touchedF) prefix.push(`Fat: ${macros.fat}g`)

  if (prefix.length === 0) return mapped.join('\n')
  return [...prefix, ...mapped].join('\n')
}

export type StabilizeDietCaloriesOptions = {
  previousCalories?: number | null
  /** When true, hold the prior daily average unless the client asked to change calories. */
  preserveCalories?: boolean
}

/**
 * After an in-place diet edit, keep calories stable for food swaps and enforce floor / weekly caps.
 */
export function stabilizeDietCaloriesAfterEdit(
  text: string,
  opts: StabilizeDietCaloriesOptions = {}
): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  const previous =
    (typeof opts.previousCalories === 'number' && opts.previousCalories > 0
      ? opts.previousCalories
      : null) ?? parseHeaderCalories(trimmed)
  const inferred = inferMacrosFromDietText(trimmed)
  const headerProtein = parseInt(trimmed.match(HEADER_PROTEIN)?.[1] ?? '0', 10)
  const headerCarbs = parseInt(trimmed.match(HEADER_CARBS)?.[1] ?? '0', 10)
  const headerFat = parseInt(trimmed.match(HEADER_FAT)?.[1] ?? '0', 10)

  let targetCalories = inferred?.calories ?? previous ?? DIET_FLOOR_TARGET_KCAL

  if (opts.preserveCalories && typeof previous === 'number' && previous > 0) {
    targetCalories = previous
  } else if (typeof previous === 'number' && previous > 0) {
    targetCalories = clampCaloriesToWeeklyBand(targetCalories, previous)
  }

  targetCalories = Math.max(targetCalories, DIET_FLOOR_TARGET_KCAL)

  const macros: MacroTotals = {
    calories: targetCalories,
    protein:
      opts.preserveCalories && headerProtein > 0
        ? headerProtein
        : inferred?.protein ?? headerProtein,
    carbs: inferred?.carbs ?? headerCarbs,
    fat: inferred?.fat ?? headerFat,
  }

  let out = rewriteNutritionHeader(trimmed, macros)
  out = reconcileDietProseCalories(out, targetCalories)
  return out
}

/** Clamp generated JSON macros when safety retry is exhausted. */
export function clampGeneratedNutritionCalories(
  plan: GeneratedNutritionPlan,
  opts: { previousCalories?: number | null } = {}
): GeneratedNutritionPlan {
  let cals = plan.calories
  if (typeof cals !== 'number' || !Number.isFinite(cals) || cals <= 0) return plan

  cals = Math.max(cals, DIET_FLOOR_TARGET_KCAL)
  const prev = opts.previousCalories
  if (typeof prev === 'number' && prev > 0) {
    cals = clampCaloriesToWeeklyBand(cals, prev)
  }

  if (cals === plan.calories) return plan
  return {
    ...plan,
    calories: cals,
    meals: reconcileMealsProse(plan.meals, cals),
  }
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
