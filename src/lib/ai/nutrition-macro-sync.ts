import type { GeneratedNutritionPlan } from '@/lib/ai/generate-plan'

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
  let match: RegExpExecArray | null
  const pattern = new RegExp(MEAL_MACRO_LINE.source, 'gi')
  while ((match = pattern.exec(text)) !== null) {
    perMeal.push({
      protein: parseInt(match[1]!, 10),
      carbs: parseInt(match[2]!, 10),
      fat: parseInt(match[3]!, 10),
      calories: parseInt(match[4]!, 10),
    })
  }
  return perMeal
}

function parseDailySummaryLines(text: string): MacroTotals[] {
  const daily: MacroTotals[] = []
  let match: RegExpExecArray | null
  const pattern = new RegExp(DAILY_SUMMARY_LINE.source, 'gi')
  while ((match = pattern.exec(text)) !== null) {
    daily.push({
      calories: parseInt(match[1]!, 10),
      protein: parseInt(match[2]!, 10),
      carbs: parseInt(match[3]!, 10),
      fat: parseInt(match[4]!, 10),
    })
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

/** Fill zero/placeholder nutrition_plan header fields from meal prose. */
export function syncNutritionPlanMacros(plan: GeneratedNutritionPlan): GeneratedNutritionPlan {
  const prose = collectDietProse(plan.meals)
  const inferred = inferMacrosFromDietText(prose)
  if (!inferred || inferred.calories <= 0) return plan

  return {
    ...plan,
    calories: plan.calories > 0 ? plan.calories : inferred.calories,
    protein: plan.protein > 0 ? plan.protein : inferred.protein,
    carbs: plan.carbs > 0 ? plan.carbs : inferred.carbs,
    fat: plan.fat > 0 ? plan.fat : inferred.fat,
  }
}
