import type { GeneratedNutritionPlan } from '@/lib/ai/generate-plan'
import type { NutritionTargets } from '@/lib/ai/nutrition-targets'

export type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

const MEAL_MACRO_LINE =
  /\(P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g\s*\|\s*~?\s*(\d+)\s*kcal\)/gi

/** Daily averages: ~1850 kcal | P: 130g | C: 200g | F: 55g */
const DAILY_AVERAGE_PCF =
  /(?:daily\s+averages?|daily\s+totals?|adjusted\s+weekly\s+average)\s*:?\s*~?\s*(\d{3,4})\s*kcal\s*\|\s*P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g/gi

/** ~1850 kcal | 130g protein | 200g carbs | 55g fat */
const DAILY_SUMMARY_WORDS =
  /~?\s*(\d{3,4})\s*kcal\s*\|\s*(\d+)\s*g\s*protein\s*\|\s*(\d+)\s*g\s*carbs\s*\|\s*(\d+)\s*g\s*fat/gi

/** Daily Total: P: 73g | C: 210g | F: 55g | ~1570 kcal */
const DAILY_TOTAL_PCF =
  /(?:daily\s+total|day\s+total|total\s+for\s+(?:the\s+)?day)\s*:?\s*P:\s*(\d+)\s*g\s*\|\s*C:\s*(\d+)\s*g\s*\|\s*F:\s*(\d+)\s*g\s*\|\s*~?\s*(\d+)\s*kcal/gi

const HEADER_CALORIES = /calories:\s*(\d+)/i
const HEADER_PROTEIN = /protein:\s*(\d+)\s*g/i
const HEADER_CARBS = /carbs:\s*(\d+)\s*g/i
const HEADER_FAT = /fat:\s*(\d+)\s*g/i

const ATWATER_MEAL_TOLERANCE = 100
const ATWATER_DAY_TOLERANCE = 150
const TARGET_CAL_TOLERANCE = 120
const TARGET_PROTEIN_TOLERANCE = 15

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

/** Prefer Atwater when the stated kcal clearly disagrees with P/C/F. */
export function normalizeMacroCalories(m: MacroTotals): MacroTotals {
  const atwater = Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9)
  if (m.protein <= 0 && m.carbs <= 0 && m.fat <= 0) return m
  if (m.calories <= 0) return { ...m, calories: atwater }
  if (Math.abs(atwater - m.calories) > ATWATER_MEAL_TOLERANCE) {
    return { ...m, calories: atwater }
  }
  return m
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
  let match: RegExpExecArray | null
  const pattern = new RegExp(MEAL_MACRO_LINE.source, 'gi')
  while ((match = pattern.exec(text)) !== null) {
    perMeal.push(
      normalizeMacroCalories({
        protein: parseInt(match[1]!, 10),
        carbs: parseInt(match[2]!, 10),
        fat: parseInt(match[3]!, 10),
        calories: parseInt(match[4]!, 10),
      })
    )
  }
  return perMeal
}

function parseDayTotalLines(text: string): MacroTotals[] {
  const daily: MacroTotals[] = []
  let match: RegExpExecArray | null
  const dayTotal = new RegExp(DAILY_TOTAL_PCF.source, 'gi')
  while ((match = dayTotal.exec(text)) !== null) {
    daily.push(
      normalizeMacroCalories({
        protein: parseInt(match[1]!, 10),
        carbs: parseInt(match[2]!, 10),
        fat: parseInt(match[3]!, 10),
        calories: parseInt(match[4]!, 10),
      })
    )
  }
  return daily
}

function parseWeeklyAverageLines(text: string): MacroTotals[] {
  const daily: MacroTotals[] = []
  let match: RegExpExecArray | null

  const pcfAvg = new RegExp(DAILY_AVERAGE_PCF.source, 'gi')
  while ((match = pcfAvg.exec(text)) !== null) {
    daily.push(
      normalizeMacroCalories({
        calories: parseInt(match[1]!, 10),
        protein: parseInt(match[2]!, 10),
        carbs: parseInt(match[3]!, 10),
        fat: parseInt(match[4]!, 10),
      })
    )
  }

  const words = new RegExp(DAILY_SUMMARY_WORDS.source, 'gi')
  while ((match = words.exec(text)) !== null) {
    daily.push(
      normalizeMacroCalories({
        calories: parseInt(match[1]!, 10),
        protein: parseInt(match[2]!, 10),
        carbs: parseInt(match[3]!, 10),
        fat: parseInt(match[4]!, 10),
      })
    )
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
  const dayTotals = parseDayTotalLines(text)
  const weeklyAverages = parseWeeklyAverageLines(text)
  const mealMacros = parseMealMacroLines(text)
  const fromMeals = sumByDay(mealMacros)

  // Prefer averaging explicit per-day totals when we have a real week.
  if (dayTotals.length >= 2) {
    const avg = averageMacros(dayTotals)
    if (avg && avg.calories > 0) return avg
  }

  // Next: sum meal macro lines (authoritative when headers are aspirational).
  if (fromMeals && fromMeals.calories > 0) {
    if (weeklyAverages.length === 1) {
      const summary = weeklyAverages[0]!
      if (Math.abs(summary.calories - fromMeals.calories) > TARGET_CAL_TOLERANCE) {
        return fromMeals
      }
    }
    return fromMeals
  }

  if (dayTotals.length === 1 && dayTotals[0]!.calories > 0) {
    return dayTotals[0]!
  }

  if (weeklyAverages.length > 0) {
    const avg = averageMacros(weeklyAverages)
    if (avg && avg.calories > 0) return avg
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

/** Rewrite prose so Daily averages / Calories headers match authoritative macros. */
export function rewriteDietProseMacros(text: string, macros: MacroTotals): string {
  if (!text.trim()) return text
  const averageLine = `Daily averages: ~${macros.calories} kcal | P: ${macros.protein}g | C: ${macros.carbs}g | F: ${macros.fat}g`

  let out = text
  if (
    /(?:daily\s+averages?|adjusted\s+weekly\s+average)\s*:?/i.test(out)
  ) {
    out = out.replace(
      /(?:daily\s+averages?|adjusted\s+weekly\s+average)\s*:?[^\n]*/gi,
      averageLine
    )
  } else {
    out = `${averageLine}\n\n${out}`
  }

  // Normalize leading Calories/Protein/Carbs/Fat block if present in prose
  if (/^calories:\s*\d+/im.test(out)) {
    out = out
      .replace(/^calories:\s*\d+[^\n]*/im, `Calories: ${macros.calories}`)
      .replace(/^protein:\s*\d+\s*g[^\n]*/im, `Protein: ${macros.protein}g`)
      .replace(/^carbs:\s*\d+\s*g[^\n]*/im, `Carbs: ${macros.carbs}g`)
      .replace(/^fat:\s*\d+\s*g[^\n]*/im, `Fat: ${macros.fat}g`)
  }

  return out
}

function rewriteMealsProse(meals: unknown[], macros: MacroTotals): unknown[] {
  return meals.map((meal) => {
    if (!isRecord(meal)) return meal
    const next = { ...meal }
    for (const key of ['example', 'description', 'content'] as const) {
      const value = next[key]
      if (typeof value === 'string' && value.trim()) {
        next[key] = rewriteDietProseMacros(value, macros)
      }
    }
    return next
  })
}

/**
 * Always overwrite nutrition_plan header macros from meal/day totals when inferable.
 * Previously only filled zeros, which left aspirational wrong headers in place.
 */
export function syncNutritionPlanMacros(plan: GeneratedNutritionPlan): GeneratedNutritionPlan {
  const prose = collectDietProse(plan.meals)
  const inferred = inferMacrosFromDietText(prose)
  if (!inferred || inferred.calories <= 0) {
    // Still normalize header Atwater if we only have JSON fields
    if (plan.calories > 0 && plan.protein > 0) {
      const normalized = normalizeMacroCalories({
        calories: plan.calories,
        protein: plan.protein,
        carbs: plan.carbs,
        fat: plan.fat,
      })
      return { ...plan, ...normalized }
    }
    return plan
  }

  const macros = normalizeMacroCalories(inferred)
  return {
    ...plan,
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    meals: rewriteMealsProse(plan.meals, macros),
  }
}

export type NutritionMacroAssessment = {
  ok: boolean
  error: string | null
  macros: MacroTotals
  atwater: number
  atwaterDelta: number
  targetCalorieDelta: number | null
  targetProteinDelta: number | null
}

/**
 * Validate that synced macros are physically consistent and (when targets provided)
 * land near the server-computed calorie/protein targets.
 */
export function assessNutritionMacroConsistency(
  plan: GeneratedNutritionPlan,
  targets?: NutritionTargets | null
): NutritionMacroAssessment {
  const macros: MacroTotals = {
    calories: plan.calories,
    protein: plan.protein,
    carbs: plan.carbs,
    fat: plan.fat,
  }
  const atwater = Math.round(macros.protein * 4 + macros.carbs * 4 + macros.fat * 9)
  const atwaterDelta = Math.abs(atwater - macros.calories)
  const targetCalorieDelta =
    targets != null ? Math.abs(macros.calories - targets.calories) : null
  const targetProteinDelta =
    targets != null ? Math.abs(macros.protein - targets.protein) : null

  if (macros.calories <= 0) {
    return {
      ok: false,
      error: 'nutrition_plan.calories must be a positive number matching the meal plan totals.',
      macros,
      atwater,
      atwaterDelta,
      targetCalorieDelta,
      targetProteinDelta,
    }
  }

  if (atwaterDelta > ATWATER_DAY_TOLERANCE) {
    return {
      ok: false,
      error: `Macro math inconsistent: ${macros.calories} kcal header vs ${atwater} kcal from P/C/F (Δ${atwaterDelta}). Rebuild meals so 4×P + 4×C + 9×F ≈ calories.`,
      macros,
      atwater,
      atwaterDelta,
      targetCalorieDelta,
      targetProteinDelta,
    }
  }

  if (targets && targetCalorieDelta != null && targetCalorieDelta > TARGET_CAL_TOLERANCE) {
    return {
      ok: false,
      error: `Daily average calories (~${macros.calories}) miss the required target ${targets.calories} kcal by ${targetCalorieDelta}. Rebuild the 7-day plan to hit ~${targets.calories} kcal | P: ${targets.protein}g | C: ${targets.carbs}g | F: ${targets.fat}g (within ±${TARGET_CAL_TOLERANCE} kcal / ±${TARGET_PROTEIN_TOLERANCE}g protein).`,
      macros,
      atwater,
      atwaterDelta,
      targetCalorieDelta,
      targetProteinDelta,
    }
  }

  if (targets && targetProteinDelta != null && targetProteinDelta > TARGET_PROTEIN_TOLERANCE) {
    return {
      ok: false,
      error: `Daily average protein (~${macros.protein}g) misses the required target ${targets.protein}g by ${targetProteinDelta}g. Adjust portions to hit protein without inventing a new calorie target.`,
      macros,
      atwater,
      atwaterDelta,
      targetCalorieDelta,
      targetProteinDelta,
    }
  }

  // Require that meal lines exist for nutrition-focused plans so we did not just trust a fake header
  const prose = collectDietProse(plan.meals)
  const mealLines = parseMealMacroLines(prose)
  if (mealLines.length < 7) {
    return {
      ok: false,
      error:
        'Diet prose must include compact meal macro lines like (P: 28g | C: 45g | F: 12g | ~400 kcal) on most meals so totals can be verified.',
      macros,
      atwater,
      atwaterDelta,
      targetCalorieDelta,
      targetProteinDelta,
    }
  }

  return {
    ok: true,
    error: null,
    macros,
    atwater,
    atwaterDelta,
    targetCalorieDelta,
    targetProteinDelta,
  }
}
