export type Coach = {
  id: string
  user_id: string
  name: string | null
  hard_cap: number | null
}

export type ClientProfile = {
  id: string
  name: string | null
  email: string | null
  coach_id: string | null
  checkin_awaiting: boolean | null
  checkin_overdue: boolean | null
  plan_delivered: boolean | null
}

export type Profile = {
  id: string
  name: string | null
  email?: string | null
  age: string | number | null
  fitness_goal: string | null
  weight: string | number | null
  height: string | number | null
}

export type Workout = {
  id: string
  user_id: string
  name: string
  duration: number
  calories: number | null
  created_at: string
  date?: string
}

export type CoachStats = {
  total: number
  awaiting: number
  overdue: number
  new: number
}

export type ProfileForm = {
  name: string
  age: string
  fitness_goal: string
  weight: string
  height: string
}

export type NewWorkoutForm = {
  name: string
  duration: string
  calories: string
  date: string
}

export type ProgressStats = {
  total: number
  totalMinutes: number
  totalCalories: number
  avgDuration: number
}
