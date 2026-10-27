import assert from 'node:assert/strict'
import { assessWorkoutStructure } from '../src/lib/ai/workout-structure'
import { assessDietFollowsRequest, clientRequestedDietChange } from '../src/lib/ai/diet-update-check'

const broken = `
Day 1 (Monday)
Main Workout:
Barbell Bench Press: 3 sets x 8 reps
Lat Pulldown: 3 sets x 10 reps
Back Squat: 3 sets x 8 reps
Day 2 (Tuesday)
Main Workout:
Barbell Bench Press: 3 sets x 8 reps
Lat Pulldown: 3 sets x 10 reps
Back Squat: 3 sets x 8 reps
`
const brokenNotes = assessWorkoutStructure(broken)
assert.ok(brokenNotes.some((line) => /back-to-back/i.test(line)), brokenNotes.join(' | '))

const good = `
Day 1 (Monday)
Main Workout:
Barbell Bench Press: 4 sets x 6 reps
Barbell Row: 4 sets x 8 reps
Overhead Press: 3 sets x 8 reps
Dumbbell Curl: 3 sets x 10 reps
Tricep Pushdown: 3 sets x 12 reps
Lateral Raise: 3 sets x 12 reps
Day 2 (Tuesday)
Main Workout:
Back Squat: 4 sets x 6 reps
Romanian Deadlift: 3 sets x 8 reps
Leg Press: 3 sets x 10 reps
Leg Curl: 3 sets x 12 reps
Calf Raise: 3 sets x 12 reps
Day 4 (Thursday)
Main Workout:
Incline Bench Press: 4 sets x 8 reps
Pull Up: 4 sets x 6 reps
Dumbbell Shoulder Press: 3 sets x 8 reps
Hammer Curl: 3 sets x 10 reps
Overhead Extension: 3 sets x 12 reps
Face Pull: 3 sets x 15 reps
`
assert.deepEqual(assessWorkoutStructure(good), [])

const noArms = `
Day 1 (Monday)
Main Workout:
Barbell Bench Press: 4 sets x 6 reps
Barbell Row: 4 sets x 8 reps
Overhead Press: 3 sets x 8 reps
Lateral Raise: 3 sets x 12 reps
Day 3 (Wednesday)
Main Workout:
Back Squat: 4 sets x 6 reps
Romanian Deadlift: 3 sets x 8 reps
Leg Press: 3 sets x 10 reps
Leg Curl: 3 sets x 12 reps
`
assert.ok(assessWorkoutStructure(noArms).some((line) => /arm work/i.test(line)))

const previousLegs = `
Day 1 (Monday)
Main Workout:
Back Squat: 4 sets x 6 reps
Romanian Deadlift: 4 sets x 8 reps
Leg Press: 3 sets x 10 reps
Leg Curl: 3 sets x 12 reps
Dumbbell Curl: 3 sets x 10 reps
Tricep Pushdown: 3 sets x 12 reps
Day 3 (Wednesday)
Main Workout:
Barbell Bench Press: 4 sets x 6 reps
Barbell Row: 4 sets x 8 reps
Overhead Press: 3 sets x 8 reps
Lateral Raise: 3 sets x 12 reps
`
const lightLegs = `
Day 1 (Monday)
Main Workout:
Calf Raise: 2 sets x 15 reps
Back Squat: 2 sets x 8 reps
Dumbbell Curl: 3 sets x 10 reps
Tricep Pushdown: 3 sets x 12 reps
Barbell Bench Press: 4 sets x 6 reps
Day 3 (Wednesday)
Main Workout:
Barbell Row: 4 sets x 8 reps
Overhead Press: 3 sets x 8 reps
Lateral Raise: 3 sets x 12 reps
Face Pull: 3 sets x 15 reps
Hammer Curl: 3 sets x 10 reps
`
assert.ok(
  assessWorkoutStructure(lightLegs, previousLegs).some((line) => /leg work/i.test(line)),
  assessWorkoutStructure(lightLegs, previousLegs).join(' | ')
)

const oldDiet = 'Day 1 (Monday)\nBreakfast: paneer bhurji and roti\nLunch: rice and dal\nDinner: roti and curd'
const sameDiet = oldDiet
assert.match(
  assessDietFollowsRequest(sameDiet, 'Please remove paneer from breakfast.', oldDiet) ?? '',
  /paneer|template/
)
const changedDiet = 'Day 1 (Monday)\nBreakfast: oats and milk\nLunch: rice and dal\nDinner: roti and curd'
assert.equal(assessDietFollowsRequest(changedDiet, 'Please remove paneer from breakfast.', oldDiet), null)
assert.match(
  assessDietFollowsRequest(changedDiet, 'Add chicken at lunch.', oldDiet) ?? '',
  /chicken/
)
assert.equal(
  assessDietFollowsRequest(oldDiet, 'Workouts felt hard. Please change the split.', oldDiet),
  null
)

const shortDay = `
Day 1 (Monday)
Main Workout:
Back Squat: 4 sets x 6 reps
Romanian Deadlift: 3 sets x 8 reps
Leg Curl: 3 sets x 12 reps
Day 3 (Wednesday)
Main Workout:
Barbell Bench Press: 4 sets x 6 reps
Barbell Row: 4 sets x 8 reps
Dumbbell Curl: 3 sets x 10 reps
Tricep Pushdown: 3 sets x 12 reps
Lateral Raise: 3 sets x 12 reps
`
assert.deepEqual(assessWorkoutStructure(shortDay), [])
assert.deepEqual(assessWorkoutStructure(noArms, null, 'Elbow pain, skip arms this week'), [])

assert.equal(clientRequestedDietChange({ progress_notes: 'Diet was good and workouts felt strong.' }), false)
assert.equal(clientRequestedDietChange({ progress_notes: 'Please remove paneer and add more rice.' }), true)
assert.equal(clientRequestedDietChange({ progress_notes: 'I am hungry all evening.' }), true)
assert.equal(clientRequestedDietChange({ digestion: 'bloated after lunch' }), true)

console.log('workout structure and diet request checks passed')
