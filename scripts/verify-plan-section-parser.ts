import { tidyWorkoutPlanText } from '../src/lib/ai/workout-tidy'
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

const embeddedWorkoutOnly = resolvePlanSections({
  nutrition_plan: `DIET
Breakfast oats

WORKOUT
Day 1: Squats 3x8
Bench 3x10

SUPPLEMENTS
Creatine 5g`,
  workout_plan: '',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert('promotes workout embedded in nutrition', embeddedWorkoutOnly.workout.includes('Squats'))
assert('diet excludes embedded workout', !embeddedWorkoutOnly.diet.includes('Squats'))
assert('still extracts supplements from nutrition', embeddedWorkoutOnly.supplements.includes('Creatine'))

const naWorkoutWithEmbed = resolvePlanSections({
  nutrition_plan: `Meal 1: rice

WORKOUT
Day 2: Deadlift 3x5`,
  workout_plan: 'N/A',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert('treats N/A workout as empty and uses nutrition embed', naWorkoutWithEmbed.workout.includes('Deadlift'))

const workoutOnlyNutrition = resolvePlanSections({
  nutrition_plan: `WORKOUT
Day 1: Squats 3x8`,
  workout_plan: '',
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert('workout-only nutrition promotes to workout', workoutOnlyNutrition.workout.includes('Squats'))
assert('workout-only nutrition does not leave workout in diet', !workoutOnlyNutrition.diet.includes('Squats'))

const nutritionInsideWorkout = resolvePlanSections({
  nutrition_plan: `Calories: 1790
Protein: 100g

Weekly Diet Plan: South Indian meals
Breakfast: idli`,
  workout_plan: `David, nutrition switched to South Indian. Workout stays the same.

NUTRITION PLAN

Daily Meal Plan
Breakfast: idli and sambar
Lunch: rice and rasam

WORKOUT PLAN
Day 1: Bench Press 4 sets x 8 reps
Squats 3 sets x 10 reps`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})

assert(
  'strips NUTRITION PLAN block out of workout field',
  !nutritionInsideWorkout.workout.includes('idli and sambar')
)
assert(
  'keeps real exercises after embedded nutrition',
  nutritionInsideWorkout.workout.includes('Bench Press') &&
    nutritionInsideWorkout.workout.includes('Squats')
)
assert(
  'diet still comes from nutrition_plan field',
  nutritionInsideWorkout.diet.includes('Calories: 1790')
)
assert('recognizes NUTRITION PLAN header', !nutritionInsideWorkout.workout.includes('NUTRITION PLAN'))

const humanized = normalizeAiPlanProse(
  '## Monday\n**Warm up**\n- Squats: 4 sets x 8 reps\n* Walk for 20 minutes\nUse a well-balanced meal.'
)
assert('removes markdown heading markers', !humanized.includes('#'))
assert('removes asterisks from generated prose', !humanized.includes('*'))
assert('removes hyphen and star bullet prefixes', humanized.includes('Squats: 4 sets x 8 reps\nWalk for 20 minutes'))
assert('strips in-sentence hyphens', humanized.includes('well balanced') && !humanized.includes('well-balanced'))

const repeated = tidyWorkoutPlanText(`Intro.

Day 1 (Monday): Lower Body
Warm-up:
Dumbbell Bench Press: 2 sets x 10 reps
Main Workout:
Leg Press: 3 sets x 10 reps
Dumbbell Bench Press: 3 sets x 8 reps
Hamstring Curl: 3 sets x 12 reps

Day 2 (Tuesday): Upper Body
Main Workout:
Dumbbell Bench Press: 2 sets x 10 reps
Dumbbell Bench Press: 3 sets x 8 reps
Lat Pulldown: 3 sets x 10 reps

Day 1 (Monday): Lower Body
Main Workout:
Leg Press: 3 sets x 10 reps
`)
assert('drops the pasted second week', (repeated.match(/Day 1/g) ?? []).length === 1)

const outlineThenFull = tidyWorkoutPlanText(`Monday — Push

Day 1 (Monday)
Warm-up:
Arm Circles: 2 sets x 15 reps
Main Workout:
Bench Press: 4 sets x 8 reps
Overhead Press: 3 sets x 10 reps
`)
assert('a short Monday outline does not hide the full session', outlineThenFull.includes('Bench Press'))
assert('the full Monday session keeps the later lifts', outlineThenFull.includes('Overhead Press'))
assert('leg day does not keep a chest press', !/bench/i.test(repeated.split('Day 2')[0] ?? ''))
assert('leg day keeps the leg work', /leg press/i.test(repeated) && /hamstring curl/i.test(repeated))
assert('upper day lists bench once', (repeated.split('Day 2')[1] ?? '').match(/bench press/gi)?.length === 1)
assert('upper day does not keep a leg press', !/leg press/i.test(repeated.split('Day 2')[1] ?? ''))

const dietInWorkout = resolvePlanSections({
  nutrition_plan: `Calories: 1970
Protein: 94g

Day 1 (Monday)

Breakfast 11:15
Have oats with milk.

Lunch 14:00
Dal and rice.

Dinner 20:00
Paneer and roti.`,
  workout_plan: `Diet Plan

Day 1 (Monday)

Breakfast
Oats: 60 g

Lunch
Paneer bhurji

Dinner
Chapati and dal`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})
assert('diet field stays the diet', dietInWorkout.diet.includes('Have oats with milk'))
assert('a diet pasted into workout is not shown as the workout', !dietInWorkout.workout.includes('Paneer bhurji'))
assert('a diet pasted into workout does not replace the real meals', !dietInWorkout.diet.includes('Paneer bhurji'))

const trainingInDiet = resolvePlanSections({
  nutrition_plan: `Training Schedule

Day 1 (Monday) – Chest and Back

Warm-up:
Band Pull Apart: 2 sets x 15 reps

Main Workout:
Barbell Bench Press: 4 sets x 8 reps
Lat Pulldown: 3 sets x 10 reps

Day 1 (Monday)

Breakfast 07:00
Oats and whey.

Lunch 12:00
Paneer and rice.

Dinner 20:00
Dal and roti.`,
  workout_plan: `Day 1 (Monday): Push

Warm-up:
Arm Circles: 2 sets x 10 reps

Main Workout:
Dumbbell Bench Press: 3 sets x 8 reps
Overhead Press: 3 sets x 10 reps`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})
assert('meals stay on the diet', trainingInDiet.diet.includes('Oats and whey'))
assert('training schedule is not shown on the diet', !trainingInDiet.diet.includes('Lat Pulldown'))
assert('stored workout stays the workout', trainingInDiet.workout.includes('Overhead Press'))

const swapped = resolvePlanSections({
  nutrition_plan: `Day 1 (Monday): Push

Warm-up:
Arm Circles: 2 sets x 10 reps

Main Workout:
Dumbbell Bench Press: 3 sets x 8 reps
Overhead Press: 3 sets x 10 reps`,
  workout_plan: `Diet Plan

Breakfast
Oats and milk

Lunch
Rice and dal

Dinner
Paneer and roti`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})
assert('swapped fields put meals on the diet', swapped.diet.includes('Rice and dal'))
assert('swapped fields put lifts on the workout', swapped.workout.includes('Dumbbell Bench Press'))
assert('swapped diet does not keep the lifts', !swapped.diet.includes('Overhead Press'))

const dietThenWorkout = resolvePlanSections({
  nutrition_plan: `Calories: 2000

Breakfast
Idli

Lunch
Rice

Dinner
Rasam`,
  workout_plan: `Diet Plan

Breakfast
Oats

Lunch
Dal

Dinner
Paneer

Day 1 (Monday): Push

Warm-up:
Arm Circles: 2 sets x 10 reps

Main Workout:
Barbell Bench Press: 4 sets x 8 reps
Lat Pulldown: 3 sets x 10 reps`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})
assert('mixed workout keeps the sessions', dietThenWorkout.workout.includes('Barbell Bench Press'))
assert('mixed workout drops the leading diet', !dietThenWorkout.workout.includes('Rasam') && !/^\s*breakfast/im.test(dietThenWorkout.workout))
assert('real diet stays in the diet section', dietThenWorkout.diet.includes('Idli'))

const foodNoteThenDays = resolvePlanSections({
  nutrition_plan: `Calories: 2418

Day 1 (Monday)
Breakfast, 10:00: 2 rotis

Lunch
Rice and dal

Dinner
Paneer and roti`,
  workout_plan: `This home plan uses bodyweight and bands.

Food Plan

Use only in-house meals. Remove all outside foods, including vada pav.

Day 1 (Monday): Push

Warm-up:
Easy March: 5 min.

Main Workout:
Push Up: 4 sets x 8 to 12 reps.`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})
assert('food note does not hide the training days', foodNoteThenDays.workout.includes('Push Up'))
assert('food note does not hide the day title', foodNoteThenDays.workout.includes('Day 1 (Monday)'))
assert('food note stays off the workout', !foodNoteThenDays.workout.includes('vada pav'))
assert('existing meals stay on the diet', foodNoteThenDays.diet.includes('2 rotis'))

const postWorkoutMeal = resolvePlanSections({
  nutrition_plan: `Day 1 (Monday)

Breakfast
Oats and milk

Lunch
Rice and dal

Post-Workout
1 banana and buttermilk

Dinner
Paneer and roti`,
  workout_plan: `Day 1 (Monday): Push

Warm-up:
Arm Circles: 2 sets x 10 reps

Main Workout:
Dumbbell Bench Press: 3 sets x 8 reps`,
  supplement_plan: '',
  cardio_plan: '',
  coach_notes: '',
})
assert('post-workout meal stays on the diet', postWorkoutMeal.diet.includes('banana and buttermilk'))
assert('post-workout meal is not moved onto the workout', !postWorkoutMeal.workout.includes('buttermilk'))

if (failed > 0) {
  console.error(`\n${failed} plan parser checks failed`)
  process.exit(1)
}

console.log('\nAll plan parser checks passed')
