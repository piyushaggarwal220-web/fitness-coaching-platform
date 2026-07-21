import { resolvePlanSections } from '../src/lib/plan-section-parser'
import { normalizeAiPlanProse } from '../src/lib/ai/plan-format'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

const combinedDiet = `Calories: 2000
Protein: 150g

DIET
Breakfast: oats and eggs
Lunch: dal and rice

SUPPLEMENTS
Creatine 5g daily
Vitamin D 2000 IU

COACH NOTES
Sleep 8 hours`

const parsedDiet = resolvePlanSections({
  nutrition_plan: combinedDiet,
  workout_plan: '',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert('extracts supplements from diet blob', parsedDiet.supplements.includes('Creatine'))
assert('extracts coach notes from diet blob', parsedDiet.coachNotes.includes('Sleep'))
assert('diet excludes supplements section', !parsedDiet.diet.includes('Creatine'))
assert('preserves macro header in diet', parsedDiet.diet.includes('Calories: 2000'))

const combinedWorkout = `WORKOUT
Day 1: Squat 4x8

CARDIO
8000 steps daily

COACH NOTES
Stretch daily`

const parsedWorkout = resolvePlanSections({
  nutrition_plan: '',
  workout_plan: combinedWorkout,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert('extracts cardio from workout blob', parsedWorkout.cardio.includes('8000 steps'))
assert('extracts coach notes from workout blob', parsedWorkout.coachNotes.includes('Stretch'))
assert('workout excludes cardio section', !parsedWorkout.workout.includes('8000 steps'))

const legacy = resolvePlanSections({
  nutrition_plan: 'Calories: 1800\nMeal 1: oats',
  workout_plan: 'Monday: squats',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert('legacy unstructured diet preserved', legacy.diet.includes('Calories: 1800'))
assert('legacy workout preserved', legacy.workout === 'Monday: squats')

const withMeta = resolvePlanSections({
  nutrition_plan: '',
  workout_plan: '',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes:
    '@@META{"checkinId":"abc","week":1,"generatedBy":"ai","source":"Week 1 Check-in"}@@\nGreat week — keep protein high on training days.',
})

assert('strips plan meta prefix from coach notes', !withMeta.coachNotes.includes('@@META'))
assert('preserves coach notes after meta prefix', withMeta.coachNotes.includes('Great week'))

const metaOnly = resolvePlanSections({
  nutrition_plan: '',
  workout_plan: '',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '@@META{"checkinId":"abc","week":1,"generatedBy":"ai","source":"Week 1 Check-in"}@@',
})

assert('meta-only coach notes become empty', metaOnly.coachNotes === '')

const humanized = normalizeAiPlanProse(
  '## Monday\n**Warm up**\n- Squats: 4 sets x 8 reps\n* Walk for 20 minutes\nUse a well-balanced meal.'
)
assert('removes markdown heading markers', !humanized.includes('#'))
assert('removes asterisks from generated prose', !humanized.includes('*'))
assert('removes hyphen and star bullet prefixes', humanized.includes('Squats: 4 sets x 8 reps\nWalk for 20 minutes'))
assert('preserves normal in-sentence hyphens', humanized.includes('well-balanced'))

if (failed > 0) {
  console.error(`\n${failed} plan parser checks failed`)
  process.exit(1)
}

console.log('\nAll plan parser checks passed')
