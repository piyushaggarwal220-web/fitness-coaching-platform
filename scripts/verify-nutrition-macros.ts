/**
 * Verifies nutrition target calculation + macro sync/overwrite + consistency checks.
 * Run: npx tsx scripts/verify-nutrition-macros.ts
 */
import assert from 'node:assert/strict'
import {
  assessNutritionMacroConsistency,
  inferMacrosFromDietText,
  normalizeMacroCalories,
  syncNutritionPlanMacros,
} from '../src/lib/ai/nutrition-macro-sync'
import { computeNutritionTargets } from '../src/lib/ai/nutrition-targets'
import type { OnboardingProfile } from '../src/types/database'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

function baseProfile(overrides: Partial<OnboardingProfile> = {}): OnboardingProfile {
  return {
    id: 'test-client',
    name: 'Test Client',
    email: 'test@example.com',
    role: 'client',
    age: 28,
    gender: 'male',
    height: 175,
    weight: 80,
    fitness_goal: 'fat_loss',
    training_experience: 'intermediate',
    activity_level: 'moderately_active',
    diet_preference: 'eggetarian',
    sleep_duration: '7_to_8',
    injuries: null,
    medical_notes: null,
    onboarding_data: {
      goals: { selectedGoals: ['fat_loss'] },
      lifestyle: { fluxCapacity: 'build_up', stressLevel: 'low' },
    },
    ...overrides,
  } as OnboardingProfile
}

// --- Targets ---
{
  const t = computeNutritionTargets(baseProfile())
  assert.ok(t.bmr > 1400 && t.bmr < 2200, `unexpected BMR ${t.bmr}`)
  assert.ok(t.tdee > t.bmr, 'TDEE should exceed BMR')
  assert.ok(t.calories >= 1600, 'calorie floor')
  assert.ok(t.calories < t.tdee, 'fat loss should be below TDEE')
  assert.equal(t.calories, t.protein * 4 + t.carbs * 4 + t.fat * 9)
  pass('computes Mifflin-based fat-loss targets with Atwater-clean macros')
}

{
  const gain = computeNutritionTargets(
    baseProfile({ fitness_goal: 'muscle_gain', onboarding_data: { goals: { selectedGoals: ['muscle_gain'] }, lifestyle: { fluxCapacity: 'high_flux' } } })
  )
  assert.ok(gain.calories > gain.tdee, 'muscle gain should be above TDEE')
  pass('muscle gain lands in surplus vs TDEE')
}

{
  const soft = computeNutritionTargets(
    baseProfile({ diet_preference: 'vegan' }),
    { digestion: 'bloated after high protein shakes', hunger_level: 8, diet_adherence: 4 } as never
  )
  assert.equal(soft.softProtein, true)
  assert.ok(soft.proteinPerKg <= 1.6)
  pass('soft protein mode for vegan / digestion issues')
}

// --- Sync overwrite ---
{
  const mealsProse = [
    'Daily averages: ~1950 kcal | P: 128g | C: 220g | F: 60g',
    '',
    'Day 1',
    'Breakfast: oats\n(P: 20g | C: 50g | F: 10g | ~370 kcal)',
    'Lunch: dal rice\n(P: 25g | C: 60g | F: 12g | ~448 kcal)',
    'Dinner: paneer\n(P: 30g | C: 40g | F: 18g | ~446 kcal)',
    'Snack: curd\n(P: 10g | C: 15g | F: 5g | ~145 kcal)',
    'Daily Total: P: 85g | C: 165g | F: 45g | ~1409 kcal',
    '',
    'Day 2',
    'Breakfast: oats\n(P: 20g | C: 50g | F: 10g | ~370 kcal)',
    'Lunch: dal rice\n(P: 25g | C: 60g | F: 12g | ~448 kcal)',
    'Dinner: paneer\n(P: 30g | C: 40g | F: 18g | ~446 kcal)',
    'Snack: curd\n(P: 10g | C: 15g | F: 5g | ~145 kcal)',
    'Daily Total: P: 85g | C: 165g | F: 45g | ~1409 kcal',
  ].join('\n')

  const synced = syncNutritionPlanMacros({
    calories: 1950,
    protein: 128,
    carbs: 220,
    fat: 60,
    meals: [{ meal: 'Weekly Diet Plan', example: mealsProse }],
  })

  assert.ok(Math.abs(synced.calories - 1409) <= 5, `expected ~1409 got ${synced.calories}`)
  assert.ok(Math.abs(synced.protein - 85) <= 2, `expected ~85g protein got ${synced.protein}`)
  assert.ok(!/1950/.test(String((synced.meals[0] as { example: string }).example)))
  assert.match(String((synced.meals[0] as { example: string }).example), /Daily averages: ~1409 kcal/)
  pass('overwrites aspirational header with meal/day totals')
}

{
  // Meal kcal lies vs P/C/F — normalize to Atwater
  const bad = normalizeMacroCalories({ protein: 30, carbs: 40, fat: 18, calories: 900 })
  assert.equal(bad.calories, 30 * 4 + 40 * 4 + 18 * 9)
  pass('corrects meal kcal when P/C/F Atwater disagrees')
}

{
  const inferred = inferMacrosFromDietText(
    'Day 1\n(P: 25g | C: 40g | F: 10g | ~999 kcal)\n(P: 25g | C: 40g | F: 10g | ~999 kcal)\n(P: 25g | C: 40g | F: 10g | ~999 kcal)\n(P: 25g | C: 40g | F: 10g | ~999 kcal)'
  )
  // 4 meals, divisor 1 → sum; each normalized to 350
  assert.ok(inferred)
  assert.equal(inferred!.protein, 100)
  assert.equal(inferred!.calories, 350 * 4)
  pass('infers from meal lines and Atwater-corrects inflated kcal')
}

// --- Consistency assessment ---
{
  const targets = computeNutritionTargets(baseProfile())
  const p = [Math.round(targets.protein * 0.3), Math.round(targets.protein * 0.3), Math.round(targets.protein * 0.25)]
  p.push(targets.protein - p[0]! - p[1]! - p[2]!)
  const c = [Math.round(targets.carbs * 0.3), Math.round(targets.carbs * 0.35), Math.round(targets.carbs * 0.25)]
  c.push(targets.carbs - c[0]! - c[1]! - c[2]!)
  const f = [Math.round(targets.fat * 0.25), Math.round(targets.fat * 0.3), Math.round(targets.fat * 0.3)]
  f.push(targets.fat - f[0]! - f[1]! - f[2]!)

  const dayBlock = Array.from({ length: 7 }, (_, dayIdx) => {
    const meals = [0, 1, 2, 3].map((i) => {
      const kcal = p[i]! * 4 + c[i]! * 4 + f[i]! * 9
      return `Meal ${i + 1}\n(P: ${p[i]}g | C: ${c[i]}g | F: ${f[i]}g | ~${kcal} kcal)`
    })
    return `Day ${dayIdx + 1}\n${meals.join('\n')}\nDaily Total: P: ${targets.protein}g | C: ${targets.carbs}g | F: ${targets.fat}g | ~${targets.calories} kcal`
  }).join('\n\n')

  const plan = syncNutritionPlanMacros({
    calories: 9999,
    protein: 1,
    carbs: 1,
    fat: 1,
    meals: [
      {
        meal: 'Weekly',
        example: `Daily averages: ~9999 kcal | P: 1g | C: 1g | F: 1g\n\n${dayBlock}`,
      },
    ],
  })

  assert.ok(Math.abs(plan.calories - targets.calories) <= 5, `synced ${plan.calories} vs ${targets.calories}`)
  const ok = assessNutritionMacroConsistency(plan, targets)
  assert.equal(ok.ok, true, ok.error ?? 'expected ok')
  pass('accepts plan near computed targets with meal macro lines')
}

{
  const targets = computeNutritionTargets(baseProfile())
  const bad = assessNutritionMacroConsistency(
    {
      calories: targets.calories - 400,
      protein: targets.protein - 40,
      carbs: 100,
      fat: 40,
      meals: Array.from({ length: 8 }, () => ({
        example: '(P: 10g | C: 20g | F: 5g | ~165 kcal)',
      })),
    },
    targets
  )
  assert.equal(bad.ok, false)
  assert.match(bad.error ?? '', /target|miss|inconsistent|Macro math/i)
  pass('rejects plans far from computed calorie/protein targets')
}

console.log('\nAll nutrition macro checks passed.')
