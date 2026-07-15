export type TrackerPeriod =
  | 'morning'
  | 'lunch'
  | 'afternoon'
  | 'workout'
  | 'evening'
  | 'night'

export type TrackerItemType =
  | 'meal'
  | 'workout'
  | 'cardio'
  | 'supplement'
  | 'water'
  | 'sleep'
  | 'note'

export type MealMacros = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export type TrackerMealItem = {
  id: string
  type: 'meal'
  period: TrackerPeriod
  icon: string
  title: string
  foods: string
  foodItems?: string[]
  macros?: MealMacros
  mealTime?: string
  mealTimer?: string
  notes?: string
  targetQuantity?: string
  /** Plan diet day key, e.g. monday / day-1 */
  dietDay?: string
  /** Display label, e.g. Monday */
  dietDayLabel?: string
  sortOrder: number
}

export type WorkoutExercisePhase = 'warmup' | 'main' | 'cooldown' | 'finisher' | 'mobility'

/** How the client should log this exercise in the workout tracker. */
export type ExerciseTrackingMode =
  | 'strength'
  | 'reps_only'
  | 'timed'
  | 'distance'
  | 'checkoff'

export type TrackerExerciseItem = {
  id: string
  name: string
  targetSets: number
  targetReps: string
  targetWeight?: string
  phase: WorkoutExercisePhase
  /** When omitted, UI/parser infer from prescription text. */
  trackingMode?: ExerciseTrackingMode
  targetDurationSeconds?: number
  targetDistanceMeters?: number
  restSeconds?: number
  notes?: string
  previousBest?: { reps?: number; weight?: number }
  isPr?: boolean
}

export type WorkoutPhaseBlock = {
  id: string
  phase: WorkoutExercisePhase
  label: string
  exercises: TrackerExerciseItem[]
}

export type TrackerWorkoutItem = {
  id: string
  type: 'workout'
  period: TrackerPeriod
  icon: string
  title: string
  dayLabel?: string
  focus?: string
  workoutNotes?: string
  /** Plan workout day key, e.g. monday / day-1 */
  workoutDay?: string
  /** Display label, e.g. Monday */
  workoutDayLabel?: string
  phases: WorkoutPhaseBlock[]
  /** Flat list for scoring — all exercises across phases */
  exercises: TrackerExerciseItem[]
  sortOrder: number
}

export type TrackerCardioItem = {
  id: string
  type: 'cardio'
  period: TrackerPeriod
  icon: string
  title: string
  activity: string
  target: string
  unit: string
  sortOrder: number
}

export type TrackerSupplementItem = {
  id: string
  type: 'supplement'
  period: TrackerPeriod
  icon: string
  title: string
  dose?: string
  sortOrder: number
}

export type TrackerWaterItem = {
  id: string
  type: 'water'
  period: TrackerPeriod
  icon: string
  title: string
  targetMl: number
  sortOrder: number
}

export type TrackerSleepItem = {
  id: string
  type: 'sleep'
  period: TrackerPeriod
  icon: string
  title: string
  targetBedtime?: string
  targetHours?: number
  sortOrder: number
}

export type TrackerNoteItem = {
  id: string
  type: 'note'
  period: TrackerPeriod
  icon: string
  title: string
  body: string
  sortOrder: number
}

export type TrackerSnapshotItem =
  | TrackerMealItem
  | TrackerWorkoutItem
  | TrackerCardioItem
  | TrackerSupplementItem
  | TrackerWaterItem
  | TrackerSleepItem
  | TrackerNoteItem

export type TrackerSnapshot = {
  generatedAt: string
  planId: string
  planVersion: number
  planTitle: string
  /** Active plan updated_at when this snapshot was built — used to detect mid-day plan edits */
  planUpdatedAt?: string
  items: TrackerSnapshotItem[]
  /** Available diet day options from the plan (when multi-day) */
  dietDays?: { key: string; label: string }[]
  /** Available workout day options from the plan (when multi-day) */
  workoutDays?: { key: string; label: string }[]
}

export type MealCompletion = { completed: boolean; notes?: string }
export type ExerciseSetLog = {
  reps?: number
  weight?: number
  rpe?: number
  durationSeconds?: number
  distanceMeters?: number
  completed?: boolean
}
export type ExerciseCompletion = {
  completed: boolean
  sets: ExerciseSetLog[]
  notes?: string
}
export type CardioCompletion = { actual: number; completed: boolean }
export type SupplementCompletion = { completed: boolean }
export type WaterCompletion = { ml: number }
export type SleepQualityLabel = 'excellent' | 'good' | 'average' | 'poor'
export type WakeFeeling = 'fresh' | 'okay' | 'tired'

export type SleepCompletion = {
  bedtime?: string
  wakeTime?: string
  hours?: number
  quality?: number
  qualityLabel?: SleepQualityLabel
  energy?: number
  wakeFeeling?: WakeFeeling
}

export type TrackerCompletion = {
  meals?: Record<string, MealCompletion>
  exercises?: Record<string, ExerciseCompletion>
  cardio?: Record<string, CardioCompletion>
  supplements?: Record<string, SupplementCompletion>
  water?: WaterCompletion
  sleep?: SleepCompletion
  /** Which plan diet day the client is following today. null clears the selection. */
  selectedDietDay?: string | null
  /** Which plan workout day the client is following today. null clears the selection. */
  selectedWorkoutDay?: string | null
  /** Explicitly saved workout session for the day */
  workoutSession?: {
    status?: 'in_progress' | 'saved'
    savedAt?: string
    durationSeconds?: number
  } | null
}

export type TrackerCategoryScores = {
  diet: number
  workout: number
  water: number
  supplements: number
  cardio: number
  sleep: number
}

export type DailyTrackerDay = {
  id: string
  client_id: string
  log_date: string
  plan_id: string | null
  plan_version: number
  coaching_day: number | null
  coaching_week: number | null
  snapshot: TrackerSnapshot
  completion: TrackerCompletion
  scores: TrackerCategoryScores | null
  overall_percent: number | null
  created_at: string
  updated_at: string
}

export type TodayTrackerView = {
  day: DailyTrackerDay
  schedule: {
    coachingDay: number
    coachingWeek: number
    countdownLabel: string | null
    countdownMs: number | null
  }
  greeting: string
  streak: number
  weeklyAverage: number | null
}

export type TrackerAdherenceSummary = {
  clientId: string
  periodDays: number
  overallAverage: number
  categories: TrackerCategoryScores
  weeklyCompletion: number
  averageRpe: number | null
  missedMeals: number
  missedWorkouts: number
  exercisePerformance: { exerciseId: string; name: string; volume: number; avgRpe: number | null }[]
}
