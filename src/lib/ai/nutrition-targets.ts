import { resolveMesocycle } from '@/lib/ai/mesocycle'
import { resolveMetabolicFluxPlan, type MetabolicFluxLevel } from '@/lib/ai/metabolic-flux'
import type { Checkin, OnboardingProfile } from '@/types/database'

export type NutritionGoalBand = 'fat_loss' | 'muscle_gain' | 'recomposition' | 'other'

export type NutritionTargets = {
  calories: number
  protein: number
  carbs: number
  fat: number
  bmr: number
  tdee: number
  goalBand: NutritionGoalBand
  fluxLevel: MetabolicFluxLevel
  proteinPerKg: number
  softProtein: boolean
  calorieAdjustment: number
  mesocycleWeek: 1 | 2 | 3 | 4
  formulaNotes: string[]
}

const ACTIVITY_MULTIPLIER: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
}

/** Midpoint deficit/surplus by flux level (kcal relative to TDEE). */
const GOAL_DELTA: Record<
  MetabolicFluxLevel,
  Record<'fat_loss' | 'muscle_gain' | 'recomposition', number>
> = {
  steady: { fat_loss: -400, muscle_gain: 200, recomposition: 0 },
  build_up: { fat_loss: -300, muscle_gain: 300, recomposition: 50 },
  high_flux: { fat_loss: -200, muscle_gain: 375, recomposition: 100 },
}

/** Mesocycle calorie pairing vs base target (food rises with training load). */
const MESOCYCLE_DELTA: Record<1 | 2 | 3 | 4, number> = {
  1: -100,
  2: 0,
  3: 75,
  4: 150,
}

const CALORIE_FLOOR = 1600

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : fallback
}

function isFemale(gender: string | null | undefined): boolean {
  const g = (gender ?? '').toLowerCase()
  return g === 'female' || g === 'woman' || g === 'f'
}

/** Map fitness_goal / selected goals onto a calorie band. */
export function resolveNutritionGoalBand(profile: OnboardingProfile): NutritionGoalBand {
  const selected = profile.onboarding_data?.goals?.selectedGoals ?? []
  const tokens = [profile.fitness_goal, ...selected]
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.toLowerCase())

  const joined = tokens.join(' ')
  if (
    /\b(fat_loss|lose_fat|weight_loss|lose_weight|cut|cutting)\b/.test(joined) ||
    tokens.includes('lose_fat_fast')
  ) {
    return 'fat_loss'
  }
  if (
    /\b(muscle_gain|bulking|bulk|hypertrophy|weight_gain|gain_muscle)\b/.test(joined) ||
    tokens.includes('weight_gain')
  ) {
    return 'muscle_gain'
  }
  if (/\b(recomp|recomposition|skinny_fat|body_recomp)\b/.test(joined) || tokens.includes('skinny_fat')) {
    return 'recomposition'
  }
  if (/\b(strength|athletic|performance|endurance)\b/.test(joined)) {
    return 'recomposition'
  }
  return 'other'
}

function prefersSoftProtein(profile: OnboardingProfile, checkin?: Checkin | null): boolean {
  const diet = (profile.diet_preference ?? '').toLowerCase()
  if (diet === 'vegan' || diet === 'jain') return true

  const digestion = (checkin?.digestion ?? '').toLowerCase()
  if (/\b(bloated|bloat|gas|diarrhea|loose|constipation|upset|sensitive|cannot digest|can't digest)\b/.test(digestion)) {
    return true
  }

  const struggle = (checkin?.adherence_struggles ?? '').toLowerCase()
  const notes = [
    profile.medical_notes,
    profile.onboarding_data?.diet?.customNotes,
    profile.onboarding_data?.diet?.allergies,
    profile.onboarding_data?.diet?.previousDietsFailed,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase()

  if (/\b(low appetite|poor appetite|cannot finish|can't finish|protein makes|too much protein|hard to eat)\b/.test(`${struggle} ${notes}`)) {
    return true
  }

  // Very high hunger with poor diet adherence often means protein was forced too high/unpalatable.
  if (
    typeof checkin?.hunger_level === 'number' &&
    checkin.hunger_level >= 8 &&
    typeof checkin.diet_adherence === 'number' &&
    checkin.diet_adherence <= 5
  ) {
    return true
  }

  return false
}

function proteinPerKgFor(
  band: NutritionGoalBand,
  flux: MetabolicFluxLevel,
  soft: boolean
): number {
  if (soft) {
    return flux === 'high_flux' ? 1.6 : 1.45
  }
  const base =
    band === 'fat_loss' ? 2.0 : band === 'muscle_gain' ? 1.8 : band === 'recomposition' ? 1.9 : 1.7
  if (flux === 'high_flux') return Math.min(2.2, base + 0.1)
  if (flux === 'steady') return Math.max(1.6, base - 0.1)
  return base
}

/**
 * Deterministic daily macro targets (Mifflin-St Jeor + activity + flux goal band + mesocycle).
 * Injected into diet prompts so the model does not invent maintenance calories.
 */
export function computeNutritionTargets(
  profile: OnboardingProfile,
  checkin?: Checkin | null
): NutritionTargets {
  const notes: string[] = []
  const weight = num(checkin?.weight ?? profile.weight, 70)
  const height = num(profile.height, 170)
  const age = Math.max(16, Math.min(80, Math.round(num(profile.age, 28))))
  const female = isFemale(profile.gender)
  const flux = resolveMetabolicFluxPlan(profile)
  const band = resolveNutritionGoalBand(profile)
  const meso = resolveMesocycle(checkin?.coaching_week ?? 1)

  // Mifflin-St Jeor
  const bmr = female
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5
  notes.push(`BMR (Mifflin-St Jeor, ${female ? 'female' : 'male/other'}): ${Math.round(bmr)} kcal`)

  const activityKey = (profile.activity_level ?? 'moderately_active').toLowerCase()
  const multiplier = ACTIVITY_MULTIPLIER[activityKey] ?? 1.55
  const tdee = bmr * multiplier
  notes.push(`TDEE (×${multiplier} for ${activityKey || 'moderately_active'}): ${Math.round(tdee)} kcal`)

  let goalDelta = 0
  if (band === 'fat_loss' || band === 'muscle_gain' || band === 'recomposition') {
    goalDelta = GOAL_DELTA[flux.level][band]
  } else {
    goalDelta = GOAL_DELTA[flux.level].recomposition
  }
  notes.push(`Goal band ${band} @ ${flux.level}: ${goalDelta >= 0 ? '+' : ''}${goalDelta} kcal vs TDEE`)

  const mesoDelta = MESOCYCLE_DELTA[meso.weekInMesocycle]
  notes.push(`Mesocycle week ${meso.weekInMesocycle}: ${mesoDelta >= 0 ? '+' : ''}${mesoDelta} kcal`)

  const softProtein = prefersSoftProtein(profile, checkin)
  const proteinPerKg = proteinPerKgFor(band, flux.level, softProtein)
  let protein = Math.round(weight * proteinPerKg)
  if (softProtein) notes.push('Soft protein mode (appetite/digestion/diet limits) — gentler protein target')
  notes.push(`Protein: ${proteinPerKg.toFixed(2)} g/kg × ${weight} kg → ${protein}g`)

  let calories = Math.round(tdee + goalDelta + mesoDelta)
  if (calories < CALORIE_FLOOR) {
    notes.push(`Raised to floor ${CALORIE_FLOOR} kcal (was ${calories})`)
    calories = CALORIE_FLOOR
  }

  // Fat ~25% of calories, floor ~0.7 g/kg
  const fatFromPct = Math.round((calories * 0.25) / 9)
  const fatFloor = Math.round(weight * 0.7)
  const fat = Math.max(fatFloor, fatFromPct)

  const proteinKcal = protein * 4
  const fatKcal = fat * 9
  let carbs = Math.round((calories - proteinKcal - fatKcal) / 4)
  if (carbs < 80) {
    // Protect carbs for training — trim fat slightly if needed
    carbs = 80
    const adjustedFat = Math.max(
      fatFloor,
      Math.round((calories - proteinKcal - carbs * 4) / 9)
    )
    notes.push('Carbs floored at 80g; fat adjusted to fit calories')
    return {
      calories,
      protein,
      carbs,
      fat: adjustedFat,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      goalBand: band,
      fluxLevel: flux.level,
      proteinPerKg,
      softProtein,
      calorieAdjustment: goalDelta + mesoDelta,
      mesocycleWeek: meso.weekInMesocycle,
      formulaNotes: notes,
    }
  }

  // Re-round calories to exact Atwater from P/C/F so header math is clean
  const exactCalories = protein * 4 + carbs * 4 + fat * 9

  return {
    calories: exactCalories,
    protein,
    carbs,
    fat,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    goalBand: band,
    fluxLevel: flux.level,
    proteinPerKg,
    softProtein,
    calorieAdjustment: goalDelta + mesoDelta,
    mesocycleWeek: meso.weekInMesocycle,
    formulaNotes: notes,
  }
}

/**
 * Common Indian staple portions — keep meal macro estimates consistent
 * (and closer to what clients get when they cross-check with ChatGPT).
 */
export const STAPLE_PORTION_MACRO_REFERENCE = [
  '## Staple Portion Macro Reference (use these when estimating meal macros)',
  'Estimate every meal using these defaults unless a different weight is specified. Keep cooking fats explicit.',
  '- 1 medium roti / phulka (approx 40g atta, lightly oiled): ~120 kcal | P: 3g | C: 20g | F: 3g',
  '- 1 katori cooked dal (approx 150g): ~150 kcal | P: 9g | C: 22g | F: 3g',
  '- 1 katori cooked rice (approx 150g): ~180 kcal | P: 4g | C: 40g | F: 0g',
  '- 100g paneer (cow): ~265 kcal | P: 18g | C: 4g | F: 20g',
  '- 100g chicken breast cooked: ~165 kcal | P: 31g | C: 0g | F: 4g',
  '- 1 whole egg: ~70 kcal | P: 6g | C: 0g | F: 5g',
  '- 100g low-fat curd / dahi: ~60 kcal | P: 6g | C: 5g | F: 2g',
  '- 1 tsp ghee or oil (5ml): ~45 kcal | P: 0g | C: 0g | F: 5g',
  '- 1 scoop whey (approx 30g): ~110 kcal | P: 24g | C: 2g | F: 1g',
  '- 1 medium banana: ~105 kcal | P: 1g | C: 27g | F: 0g',
  '- 30g peanuts: ~170 kcal | P: 8g | C: 5g | F: 14g',
  'Meal kcal line MUST equal about 4×protein + 4×carbs + 9×fat (within ~20 kcal).',
].join('\n')

/** Prompt block: authoritative targets the model must hit. */
export function buildNutritionTargetsSection(
  profile: OnboardingProfile,
  checkin?: Checkin | null
): string {
  const t = computeNutritionTargets(profile, checkin)
  return [
    '## Nutrition Targets (AUTHORITATIVE — compute meals to hit these)',
    'These numbers were calculated server-side (Mifflin-St Jeor BMR × activity multiplier, then Metabolic Flux goal band + mesocycle adjustment).',
    'Do NOT invent a different maintenance or daily calorie target. Build the 7-day meal plan so daily averages land inside the tolerance below.',
    `- Daily calories: ${t.calories} kcal (tolerance ±100 kcal on the weekly average)`,
    `- Daily protein: ${t.protein}g (tolerance ±12g)`,
    `- Daily carbs: ${t.carbs}g (guide — adjust ±30g if needed to hit calories)`,
    `- Daily fat: ${t.fat}g (guide — adjust ±10g if needed to hit calories)`,
    `- Derived from: BMR ${t.bmr} → TDEE ${t.tdee} → goal/flux/meso adjustment ${t.calorieAdjustment >= 0 ? '+' : ''}${t.calorieAdjustment}`,
    `- Goal band: ${t.goalBand} | Flux: ${t.fluxLevel} | Mesocycle week: ${t.mesocycleWeek}/4`,
    t.softProtein
      ? '- Protein stance: GENTLE — do not force aggressive protein; keep meals finishable.'
      : '- Protein stance: standard — hit the protein target via food (whey only if they already use it).',
    `- Formula notes: ${t.formulaNotes.join('; ')}`,
    '- Set nutrition_plan.calories/protein/carbs/fat to the rounded 7-day AVERAGE of meal macros (must match these targets within tolerance).',
    '- Include "Daily averages: ~X kcal | P: Yg | C: Zg | F: Wg" matching those averages.',
    '',
    STAPLE_PORTION_MACRO_REFERENCE,
  ].join('\n')
}
