import type { CoachAiActionId } from '../../src/lib/coach/ai-actions'
import type { PersonaDefinition } from './persona-definitions'

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type DetectedIssue = {
  category: string
  severity: IssueSeverity
  description: string
  promptToInspect: string
}

export type DietScores = {
  calories: number
  protein: number
  mealPracticality: number
  indianFoodSuitability: number
  budgetSuitability: number
  variety: number
  goalAlignment: number
}

export type WorkoutScores = {
  exerciseSelection: number
  volume: number
  progression: number
  recovery: number
  equipmentSuitability: number
  goalAlignment: number
}

export type OverallScores = {
  coachingQuality: number
  professionalism: number
  personalization: number
  sendWithoutEdits: number
}

export type EvaluationResult = {
  diet?: DietScores
  workout?: WorkoutScores
  overall: OverallScores
  issues: DetectedIssue[]
  dietAverage?: number
  workoutAverage?: number
  overallAverage: number
}

function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)))
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function numWeight(profile: PersonaDefinition['profile']): number {
  const w = profile.weight
  const n = typeof w === 'number' ? w : parseFloat(String(w ?? 70))
  return Number.isFinite(n) ? n : 70
}

function extractDailyCalories(text: string): number[] {
  const totals: number[] = []
  const dayTotals = text.matchAll(/total[^0-9]*(?:for the day)?[^0-9]*[~≈]?\s*(\d{3,4})\s*kcal/gi)
  for (const m of dayTotals) totals.push(parseInt(m[1]!, 10))

  const dailyStructure = text.matchAll(
    /~?\s*(\d{3,4})\s*kcal\s*\|\s*(\d+)\s*g\s*protein/gi
  )
  for (const m of dailyStructure) totals.push(parseInt(m[1]!, 10))

  const mealKcals = [...text.matchAll(/~?\s*(\d{3,4})\s*kcal\)/gi)].map((m) => parseInt(m[1]!, 10))
  if (totals.length === 0 && mealKcals.length >= 4) {
    const sum = mealKcals.reduce((a, b) => a + b, 0)
    totals.push(Math.round(sum / (mealKcals.length >= 14 ? 7 : 1)))
  }

  if (totals.length === 0) {
    const header = text.match(/calories:\s*(\d+)/i)
    if (header && parseInt(header[1]!, 10) > 0) totals.push(parseInt(header[1]!, 10))
  }
  return totals
}

function extractProtein(text: string): number[] {
  const values: number[] = []
  const dayP = text.matchAll(/P:\s*(\d+)g/gi)
  for (const m of dayP) values.push(parseInt(m[1]!, 10))
  const header = text.match(/protein:\s*(\d+)g/i)
  if (header) values.push(parseInt(header[1]!, 10))
  return values
}

function expectedCalorieRange(goal: string | null, weight: number): [number, number] {
  const maintenance = weight * 30
  switch (goal) {
    case 'fat_loss':
      return [maintenance * 0.72, maintenance * 0.9]
    case 'muscle_gain':
      return [maintenance * 1.05, maintenance * 1.25]
    case 'recomposition':
      return [maintenance * 0.9, maintenance * 1.05]
    case 'strength':
      return [maintenance * 1.0, maintenance * 1.15]
    case 'athletic_performance':
      return [maintenance * 0.95, maintenance * 1.1]
    default:
      return [maintenance * 0.85, maintenance * 1.1]
  }
}

function promptForAction(actionId: CoachAiActionId, profile: PersonaDefinition['profile']): string {
  const location = profile.onboarding_data?.training?.location
  if (actionId === 'initial_diet' || actionId === 'review_update_diet') {
    return actionId === 'initial_diet' ? 'initial-diet.prompt' : 'updated-diet.prompt'
  }
  if (location === 'home') {
    return actionId === 'initial_workout' ? 'initial-workout-home.prompt' : 'updated-workout-home.prompt'
  }
  return actionId === 'initial_workout' ? 'initial-workout.prompt' : 'updated-workout.prompt'
}

const GYM_EQUIPMENT = [
  'barbell',
  'smith machine',
  'leg press',
  'cable',
  'lat pulldown',
  'hack squat',
  'pec deck',
  'seated row machine',
]
const HIGH_IMPACT = ['box jump', 'jump squat', 'burpee', 'plyometric', 'jumping jack']
const KNEE_AGGRAVATORS = ['deep squat', 'ass to grass', 'walking lunge', 'jump lunge', 'box jump']
const SHOULDER_AGGRAVATORS = ['behind neck', 'upright row', 'overhead press', 'military press', 'dips behind']

export function evaluateOutput(
  persona: PersonaDefinition,
  actionId: CoachAiActionId,
  text: string
): EvaluationResult {
  const issues: DetectedIssue[] = []
  const profile = persona.profile
  const weight = numWeight(profile)
  const goal = profile.fitness_goal
  const prompt = promptForAction(actionId, profile)
  const location = profile.onboarding_data?.training?.location ?? 'gym'
  const equipment = (profile.onboarding_data?.training?.equipmentAvailable ?? []).map((e) => e.toLowerCase())
  const isDiet = actionId === 'initial_diet' || actionId === 'review_update_diet'
  const isWorkout = actionId === 'initial_workout' || actionId === 'review_update_workout'
  const firstName = (profile.name ?? 'Client').split(' ')[0]!

  if (!new RegExp(firstName, 'i').test(text)) {
    issues.push({
      category: 'Missing personalization',
      severity: 'medium',
      description: `Output does not mention client first name (${firstName}).`,
      promptToInspect: prompt,
    })
  }

  if (text.includes('[CLIENT') || text.includes('[paste') || text.includes('{{')) {
    issues.push({
      category: 'Prompt formatting',
      severity: 'critical',
      description: 'Unreplaced placeholder tokens in output.',
      promptToInspect: prompt,
    })
  }

  let dietScores: DietScores | undefined
  let workoutScores: WorkoutScores | undefined

  if (isDiet) {
    const cals = extractDailyCalories(text)
    const proteins = extractProtein(text)
    const [minCal, maxCal] = expectedCalorieRange(goal, weight)
    const avgCal = cals.length ? avg(cals) : 0
    const avgProtein = proteins.length ? avg(proteins) : 0
    const proteinPerKg = avgProtein / weight

    let caloriesScore = 5
    if (avgCal === 0) {
      caloriesScore = 3
      issues.push({
        category: 'Unrealistic calories',
        severity: 'high',
        description: 'No clear daily calorie totals found (header may show 0).',
        promptToInspect: prompt,
      })
    } else if (avgCal < 1100) {
      caloriesScore = 2
      issues.push({
        category: 'Unrealistic calories',
        severity: 'critical',
        description: `Average daily calories (~${Math.round(avgCal)}) dangerously low.`,
        promptToInspect: prompt,
      })
    } else if (avgCal > 4500) {
      caloriesScore = 3
      issues.push({
        category: 'Unrealistic calories',
        severity: 'high',
        description: `Average daily calories (~${Math.round(avgCal)}) unusually high.`,
        promptToInspect: prompt,
      })
    } else if (avgCal >= minCal && avgCal <= maxCal) {
      caloriesScore = 9
    } else if (avgCal < minCal) {
      caloriesScore = 6
      issues.push({
        category: 'Goal misalignment',
        severity: 'medium',
        description: `Calories (~${Math.round(avgCal)}) below expected range for ${goal} (${Math.round(minCal)}-${Math.round(maxCal)}).`,
        promptToInspect: prompt,
      })
    } else {
      caloriesScore = 6
    }

    let proteinScore = 5
    const proteinTarget =
      goal === 'muscle_gain' || goal === 'strength' ? 1.8 : goal === 'fat_loss' ? 1.6 : 1.5
    if (avgProtein === 0) proteinScore = 3
    else if (proteinPerKg >= proteinTarget) proteinScore = 9
    else if (proteinPerKg >= proteinTarget - 0.3) proteinScore = 7
    else proteinScore = 5

    const indianHits = ['dal', 'roti', 'rice', 'paneer', 'idli', 'dosa', 'chana', 'curd', 'sabzi', 'katori'].filter(
      (f) => text.toLowerCase().includes(f)
    ).length
    const indianScore = clampScore(4 + indianHits)

    const mealTimes = profile.onboarding_data?.eatingPattern
    let practicality = 7
    if (mealTimes?.breakfast && text.toLowerCase().includes(mealTimes.breakfast.split('—')[0]!.trim().toLowerCase().slice(-5))) {
      practicality += 1
    }
    if (!/breakfast|lunch|dinner|snack/i.test(text)) {
      practicality = 4
      issues.push({
        category: 'Missing context',
        severity: 'medium',
        description: 'Meal structure (breakfast/lunch/dinner) not clear.',
        promptToInspect: prompt,
      })
    }

    const budget = persona.budgetMonthly ?? parseInt(profile.onboarding_data?.diet?.monthlyFoodBudget ?? '8000', 10)
    let budgetScore = 7
    if (budget <= 5000) {
      const budgetFoods = ['dal', 'chana', 'soya', 'eggs', 'seasonal', 'peanuts', 'milk', 'oats']
      const budgetMentions = budgetFoods.filter((f) => text.toLowerCase().includes(f)).length
      budgetScore = clampScore(4 + budgetMentions)
      if (budgetScore < 6) {
        issues.push({
          category: 'Budget suitability',
          severity: 'medium',
          description: `Budget client (₹${budget}/mo) — plan may not emphasize economical protein sources.`,
          promptToInspect: prompt,
        })
      }
    }

    const dayMatches = text.match(/\b(day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi) ?? []
    const varietyScore = clampScore(Math.min(10, 4 + Math.floor(dayMatches.length / 2)))

    let goalScore = 7
    if (goal === 'fat_loss' && /deficit|fat loss|cut/i.test(text)) goalScore += 1
    if (goal === 'muscle_gain' && /surplus|muscle|hypertrophy|gain/i.test(text)) goalScore += 1
    if (profile.diet_preference === 'vegetarian' && /\b(chicken|fish|mutton|prawn|egg\b|eggs\b)/i.test(text)) {
      goalScore = 2
      issues.push({
        category: 'Contradiction',
        severity: 'critical',
        description: 'Vegetarian client but non-veg items appear in diet plan.',
        promptToInspect: prompt,
      })
    }

    if (actionId === 'review_update_diet') {
      const checkin = persona.checkinScenario
      const reflectsCheckin =
        (checkin === 'high_hunger' && /hunger|satiety|fibre|protein/i.test(text)) ||
        (checkin === 'lost_too_much_weight' && /increase|maintenance|deficit|energy/i.test(text)) ||
        (checkin === 'missed_workouts' && /protein|adherence|simple/i.test(text)) ||
        (checkin === 'excellent_adherence' && /progress|increase|continue/i.test(text)) ||
        /week|check-?in|adherence|hunger|sleep|motivation/i.test(text)
      if (!reflectsCheckin) {
        issues.push({
          category: 'Poor weekly adjustments',
          severity: 'high',
          description: `Weekly diet update may not reflect check-in scenario (${checkin}).`,
          promptToInspect: 'updated-diet.prompt',
        })
      }
    }

    const favFoods = profile.onboarding_data?.diet?.favoriteFoods
    if (favFoods && !favFoods.split(',').some((f) => text.toLowerCase().includes(f.trim().toLowerCase()))) {
      issues.push({
        category: 'Ignored onboarding answers',
        severity: 'low',
        description: 'Favorite foods from onboarding not clearly incorporated.',
        promptToInspect: prompt,
      })
    }

    dietScores = {
      calories: clampScore(caloriesScore),
      protein: clampScore(proteinScore),
      mealPracticality: clampScore(practicality),
      indianFoodSuitability: clampScore(indianScore),
      budgetSuitability: clampScore(budgetScore),
      variety: varietyScore,
      goalAlignment: clampScore(goalScore),
    }
  }

  if (isWorkout) {
    const lower = text.toLowerCase()
    const setRepCount = (text.match(/\d+\s*[x×]\s*\d+/gi) ?? []).length
    const daysPerWeek = parseInt(profile.onboarding_data?.training?.daysPerWeek ?? '4', 10)

    let equipmentScore = 8
    const hasOnlyDumbbells =
      equipment.length > 0 && equipment.every((e) => e.includes('dumbbell') || e.includes('mat') || e.includes('bench'))
    const bandsOnly = equipment.some((e) => e.includes('band')) && !equipment.some((e) => e.includes('dumbbell'))
    const noEquipment = equipment.length === 0
    const home = location === 'home'

    if (home && hasOnlyDumbbells) {
      for (const g of ['barbell bench', 'smith machine', 'leg press', 'lat pulldown machine', 'cable crossover']) {
        if (lower.includes(g)) {
          equipmentScore = 3
          issues.push({
            category: 'Wrong equipment',
            severity: 'critical',
            description: `Home dumbbells-only client but plan includes "${g}".`,
            promptToInspect: prompt,
          })
        }
      }
    }
    if (bandsOnly && /\b(barbell|smith machine|hack squat)\b/i.test(text)) {
      equipmentScore = 3
      issues.push({
        category: 'Wrong equipment',
        severity: 'critical',
        description: 'Bands-only client but gym barbell equipment prescribed.',
        promptToInspect: prompt,
      })
    }
    if (bandsOnly && /\bleg press\b/i.test(text) && !/\bband(ed)?\s+leg\s+press\b/i.test(text)) {
      equipmentScore = 3
      issues.push({
        category: 'Wrong equipment',
        severity: 'critical',
        description: 'Bands-only client but machine leg press prescribed.',
        promptToInspect: prompt,
      })
    }
    if (noEquipment) {
      for (const g of GYM_EQUIPMENT) {
        if (lower.includes(g)) {
          equipmentScore = 3
          issues.push({
            category: 'Wrong equipment',
            severity: 'critical',
            description: `Bodyweight-only client but plan references ${g}.`,
            promptToInspect: prompt,
          })
        }
      }
    }

    if (profile.injuries?.toLowerCase().includes('knee')) {
      for (const k of KNEE_AGGRAVATORS) {
        if (lower.includes(k)) {
          issues.push({
            category: 'Missing injury considerations',
            severity: 'high',
            description: `Knee injury noted but plan includes "${k}".`,
            promptToInspect: prompt,
          })
        }
      }
    }
    if (profile.injuries?.toLowerCase().includes('shoulder')) {
      for (const s of SHOULDER_AGGRAVATORS) {
        if (lower.includes(s)) {
          issues.push({
            category: 'Missing injury considerations',
            severity: 'high',
            description: `Shoulder issue noted but plan includes "${s}".`,
            promptToInspect: prompt,
          })
        }
      }
    }

    const disliked = profile.onboarding_data?.training?.exercisesDisliked ?? persona.exercisesToAvoid
    if (disliked) {
      for (const term of disliked.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        const avoidPattern = new RegExp(
          `(?:avoid|no|not|without|skip|never|hate|dislike)[^.\\n]{0,40}\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        )
        const prescribePattern = new RegExp(
          `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        )
        if (prescribePattern.test(text) && !avoidPattern.test(text)) {
          issues.push({
            category: 'Ignored preferred exercises',
            severity: 'medium',
            description: `Client dislikes "${term}" but it appears in plan.`,
            promptToInspect: prompt,
          })
        }
      }
    }

    const fav = profile.onboarding_data?.training?.favoriteExercises ?? persona.preferredExercises
    if (fav && !fav.split(',').some((f) => lower.includes(f.trim().toLowerCase()))) {
      issues.push({
        category: 'Ignored onboarding answers',
        severity: 'low',
        description: 'Preferred exercises from onboarding not included.',
        promptToInspect: prompt,
      })
    }

    let volumeScore = 7
    const expectedSets = daysPerWeek * 4
    if (setRepCount < expectedSets) {
      volumeScore = 5
      issues.push({
        category: 'Unrealistic training volume',
        severity: 'medium',
        description: `Only ${setRepCount} set×rep entries for ${daysPerWeek}-day program.`,
        promptToInspect: prompt,
      })
    } else if (setRepCount > daysPerWeek * 12) {
      volumeScore = 5
      issues.push({
        category: 'Unrealistic training volume',
        severity: 'medium',
        description: 'Very high exercise count — may be excessive volume.',
        promptToInspect: prompt,
      })
    }

    const progressionScore = /progressive overload|add weight|increase load|rir|rpe|progress/i.test(text) ? 8 : 5
    const recoveryScore =
      /rest day|recovery|sleep|deload|mobility|stretch|warm[- ]?up/i.test(text) ? 8 : 5

    let exerciseScore = 7
    if (goal === 'strength' && !/squat|bench|deadlift/i.test(text)) {
      exerciseScore = 5
      issues.push({
        category: 'Goal misalignment',
        severity: 'medium',
        description: 'Strength-focused client but main lifts not emphasized.',
        promptToInspect: prompt,
      })
    }

    if (actionId === 'review_update_workout') {
      const reflects =
        (persona.checkinScenario === 'strength_increased' && /volume|progress|increase|overload/i.test(text)) ||
        (persona.checkinScenario === 'missed_workouts' && /maintain|simplify|shorter|minimum/i.test(text)) ||
        (persona.checkinScenario === 'poor_sleep' && /recovery|reduce|volume|deload/i.test(text)) ||
        /week|check-?in|adherence|performance/i.test(text)
      if (!reflects) {
        issues.push({
          category: 'Poor weekly adjustments',
          severity: 'high',
          description: `Weekly workout update may not reflect check-in (${persona.checkinScenario}).`,
          promptToInspect: prompt,
        })
      }
    }

    workoutScores = {
      exerciseSelection: clampScore(exerciseScore),
      volume: clampScore(volumeScore),
      progression: clampScore(progressionScore),
      recovery: clampScore(recoveryScore),
      equipmentSuitability: clampScore(equipmentScore),
      goalAlignment: clampScore(goal === 'fat_loss' && /cardio|steps|walk/i.test(text) ? 8 : 7),
    }
  }

  const personalization =
    issues.filter((i) => i.category.includes('personalization') || i.category.includes('onboarding')).length === 0
      ? 8
      : 5
  const professionalism = /hey |!|awesome|excited/i.test(text) ? 7 : 8
  const coachingQuality = clampScore(10 - issues.filter((i) => i.severity === 'critical').length * 3 - issues.filter((i) => i.severity === 'high').length)
  const sendWithoutEdits =
    issues.some((i) => i.severity === 'critical') ? 3 : issues.some((i) => i.severity === 'high') ? 5 : 7

  const overall: OverallScores = {
    coachingQuality: clampScore(coachingQuality),
    professionalism: clampScore(professionalism),
    personalization: clampScore(personalization),
    sendWithoutEdits: clampScore(sendWithoutEdits),
  }

  const dietAverage = dietScores ? avg(Object.values(dietScores)) : undefined
  const workoutAverage = workoutScores ? avg(Object.values(workoutScores)) : undefined
  const overallAverage = avg(
    [dietAverage, workoutAverage, avg(Object.values(overall))].filter((n): n is number => n !== undefined)
  )

  return {
    diet: dietScores,
    workout: workoutScores,
    overall,
    issues,
    dietAverage,
    workoutAverage,
    overallAverage,
  }
}
