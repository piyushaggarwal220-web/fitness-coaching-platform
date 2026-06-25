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
  fitness_goal: string | null
  checkin_awaiting: boolean | null
  checkin_overdue: boolean | null
  plan_delivered: boolean | null
  updated_at?: string | null
}

export type CoachClientDetail = ClientProfile & {
  age: string | number | null
  weight: string | number | null
  height: string | number | null
}

export type Profile = {
  id: string
  name: string | null
  email?: string | null
  age: string | number | null
  fitness_goal: string | null
  weight: string | number | null
  height: string | number | null
  gender?: string | null
  activity_level?: string | null
  training_experience?: string | null
  diet_preference?: string | null
  injuries?: string | null
  medical_notes?: string | null
  sleep_duration?: string | null
  onboarding_complete?: boolean | null
  updated_at?: string | null
  coach_id?: string | null
  checkin_awaiting?: boolean | null
  checkin_overdue?: boolean | null
  plan_delivered?: boolean | null
}

export type OnboardingProfile = Profile

export type OnboardingFormData = {
  age: string
  gender: string
  height: string
  weight: string
  fitness_goal: string
  training_experience: string
  activity_level: string
  diet_preference: string
  injuries: string
  medical_notes: string
  sleep_duration: string
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

export type Checkin = {
  id: string
  client_id: string
  coach_id: string
  submitted_at: string
  weight: number | null
  waist: number | null
  progress_photo_front: string | null
  progress_photo_side: string | null
  progress_photo_back: string | null
  energy_level: number | null
  hunger_level: number | null
  training_performance: number | null
  adherence_score: number | null
  notes: string | null
  coach_response: string | null
  reviewed: boolean
  reviewed_at: string | null
}

export type CheckinWithClient = Checkin & {
  profiles?: Pick<ClientProfile, 'name' | 'email'> | null
}

export type CheckinFormData = {
  weight: string
  waist: string
  energy_level: string
  hunger_level: string
  training_performance: string
  adherence_score: string
  notes: string
}

export type CoachCheckinResponse = {
  feedback: string
  action_items: string
}

export type Plan = {
  id: string
  client_id: string
  coach_id: string
  title: string
  phase: string | null
  workout_plan: string | null
  nutrition_plan: string | null
  cardio_plan: string | null
  supplement_plan: string | null
  coach_notes: string | null
  version: number
  active: boolean
  delivered_at: string | null
  updated_at: string
  created_at: string
}

export type PlanWithClient = Plan & {
  profiles?: Pick<ClientProfile, 'name' | 'email'> | null
}

export type PlanFormData = {
  client_id: string
  title: string
  phase: string
  workout_plan: string
  nutrition_plan: string
  cardio_plan: string
  supplement_plan: string
  coach_notes: string
}

export type AiKnowledgeCategory =
  | 'fat_loss'
  | 'muscle_gain'
  | 'recomposition'
  | 'strength'
  | 'nutrition'
  | 'cardio'
  | 'supplements'
  | 'recovery'
  | 'checkins'
  | 'injuries'
  | 'female'
  | 'beginner'
  | 'intermediate'
  | 'advanced'

export type AiKnowledge = {
  id: string
  title: string
  category: AiKnowledgeCategory
  content: string
  version: number
  active: boolean
  created_at: string
  updated_at: string
}

export type CreateAiKnowledgeInput = {
  title: string
  category: AiKnowledgeCategory
  content: string
  version?: number
  active?: boolean
}

export type UpdateAiKnowledgeInput = {
  title?: string
  category?: AiKnowledgeCategory
  content?: string
  version?: number
  active?: boolean
}
