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
  phone?: string | null
  role?: 'client' | 'coach' | 'admin' | 'super_admin' | null
  coach_id: string | null
  fitness_goal: string | null
  onboarding_complete?: boolean | null
  checkin_awaiting: boolean | null
  checkin_overdue: boolean | null
  plan_delivered: boolean | null
  updated_at?: string | null
  complexity_score?: number | null
  complexity_tier?: 'low' | 'medium' | 'high' | null
  complexity_previous_score?: number | null
  complexity_score_change?: number | null
  complexity_last_calculated_at?: string | null
}

export type CoachClientDetail = ClientProfile & {
  age: string | number | null
  weight: string | number | null
  height: string | number | null
  training_experience?: string | null
  activity_level?: string | null
  diet_preference?: string | null
  injuries?: string | null
  medical_notes?: string | null
  complexity_previous_score?: number | null
  complexity_last_calculated_at?: string | null
  complexity_input_needs_review?: boolean | null
  complexity_input_review_reasons?: string[] | null
  league_opt_in?: boolean | null
}

/** Structured coaching intake stored in profiles.onboarding_data */
export type OnboardingData = {
  version: 1
  resumeStep: number
  lastSavedAt?: string
  goals?: {
    targetWeight?: string | number | null
    deadline?: string | null
    biggestStruggle?: string | null
    goalSelectionMethod?: 'user' | 'ai'
    aiSelectedGoal?: boolean
    userIndicatedUnsure?: boolean
    inferredGoal?: string | null
  }
  lifestyle?: {
    occupation?: string | null
    dailySteps?: string | null
    stressLevel?: string | null
    waterIntake?: string | null
  }
  training?: {
    location?: string | null
    daysPerWeek?: string | number | null
    durationMinutes?: string | null
    preferredTime?: string | null
    equipmentAvailable?: string[] | null
    favoriteExercises?: string | null
    exercisesDisliked?: string | null
  }
  medical?: {
    conditions?: string | null
    painDuringExercise?: string | null
    medications?: string | null
    acne?: string | null
    hairLoss?: string | null
    sexualHealth?: string | null
  }
  diet?: {
    eggDaysPerWeek?: string | null
    chickenDaysPerWeek?: string | null
    fishDaysPerWeek?: string | null
    wheyProtein?: string | null
    allergies?: string | null
    foodsDisliked?: string | null
    favoriteFoods?: string | null
    monthlyFoodBudget?: string | null
    cookingAbility?: string | null
  }
  eatingPattern?: {
    breakfast?: string | null
    lunch?: string | null
    dinner?: string | null
    snacks?: string | null
    timings?: {
      breakfast?: string | null
      lunch?: string | null
      dinner?: string | null
      snacks?: string | null
    }
  }
  supplements?: {
    current?: string | null
  }
}

export type Profile = {
  id: string
  name: string | null
  email?: string | null
  phone?: string | null
  role?: 'client' | 'coach' | 'admin' | 'super_admin' | null
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
  onboarding_completed_at?: string | null
  onboarding_data?: OnboardingData | null
  payment_confirmed?: boolean | null
  access_source?: 'purchase' | 'admin_trial' | null
  subscription_expires_at?: string | null
  progress_photo_front?: string | null
  progress_photo_side?: string | null
  progress_photo_back?: string | null
  terms_accepted_at?: string | null
  updated_at?: string | null
  coach_id?: string | null
  checkin_awaiting?: boolean | null
  checkin_overdue?: boolean | null
  plan_delivered?: boolean | null
  complexity_score?: number | null
  complexity_raw_score?: number | null
  complexity_tier?: 'low' | 'medium' | 'high' | null
  complexity_last_calculated_at?: string | null
  complexity_previous_score?: number | null
  complexity_previous_tier?: 'low' | 'medium' | 'high' | null
  complexity_score_change?: number | null
  complexity_input_needs_review?: boolean | null
  complexity_input_review_reasons?: string[] | null
  league_opt_in?: boolean | null
}

export type OnboardingProfile = Profile

export type OnboardingFormData = {
  name: string
  age: string
  gender: string
  height: string
  weight: string
  fitness_goal: string
  target_weight: string
  goal_deadline: string
  biggest_struggle: string
  occupation: string
  activity_level: string
  daily_steps: string
  sleep_duration: string
  stress_level: string
  water_intake: string
  training_location: string
  training_experience: string
  training_days_per_week: string
  workout_duration: string
  preferred_workout_time: string
  equipment_available: string[]
  favorite_exercises: string
  exercises_disliked: string
  injuries: string
  medical_notes: string
  pain_during_exercise: string
  medications: string
  acne_status: string
  hair_loss_status: string
  sexual_health_status: string
  diet_preference: string
  egg_days: string
  chicken_days: string
  fish_days: string
  whey_protein: string
  food_allergies: string
  foods_disliked: string
  favorite_foods: string
  monthly_food_budget: string
  cooking_ability: string
  breakfast: string
  lunch: string
  dinner: string
  snacks: string
  timing_breakfast: string
  timing_lunch: string
  timing_dinner: string
  timing_snacks: string
  current_supplements: string
  terms_accepted: boolean
}

export type Purchase = {
  id: string
  user_id: string | null
  razorpay_payment_id: string
  razorpay_order_id: string
  plan_slug: string
  plan_name: string
  amount_paise: number
  currency: string
  status: string
  customer_email: string
  customer_name: string | null
  claim_token_hash?: string | null
  claim_token_expires_at?: string | null
  claimed_at?: string | null
  created_at: string
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
  phone: string
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

export type CheckinType = 'mid_week' | 'weekly'

export type Checkin = {
  id: string
  client_id: string
  coach_id: string
  submitted_at: string
  checkin_type: CheckinType
  coaching_week: number | null
  coaching_day: number | null
  due_date: string | null
  weight: number | null
  waist: number | null
  progress_photo_front: string | null
  progress_photo_side: string | null
  progress_photo_back: string | null
  energy_level: number | null
  hunger_level: number | null
  training_performance: number | null
  adherence_score: number | null
  diet_adherence: number | null
  workout_adherence: number | null
  sleep_quality: number | null
  stress_level: number | null
  motivation_level: number | null
  digestion: string | null
  pain_injuries: string | null
  questions_for_coach: string | null
  cardio_completed: string | null
  extra_photos: string[] | null
  plan_version: number | null
  notes: string | null
  coach_response: string | null
  reviewed: boolean
  reviewed_at: string | null
}

export type JourneyEntry = {
  id: string
  client_id: string
  checkin_id: string
  entry_date: string
  weight: number | null
  photo_front: string | null
  photo_side: string | null
  photo_back: string | null
  extra_photos: string[] | null
  checkin_summary: string | null
  plan_version: number | null
  created_at: string
}

export type ComplexityScoreHistory = {
  id: string
  client_id: string
  raw_score: number
  display_score: number
  tier: 'low' | 'medium' | 'high'
  previous_raw_score: number | null
  previous_display_score: number | null
  previous_tier: 'low' | 'medium' | 'high' | null
  score_change: number | null
  trigger_source:
    | 'onboarding_complete'
    | 'weekly_checkin'
    | 'profile_edit_client'
    | 'profile_edit_coach'
    | 'profile_edit_admin'
    | 'manual'
  reasoning: string[]
  checkin_id: string | null
  created_at: string
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

export type MidWeekCheckinFormData = {
  diet_adherence: string
  workout_adherence: string
  energy_level: string
  sleep_quality: string
  stress_level: string
  hunger_level: string
  pain_injuries: string
  questions_for_coach: string
  additional_comments: string
}

export type WeeklyCheckinFormData = {
  weight: string
  diet_adherence: string
  workout_adherence: string
  energy_level: string
  sleep_quality: string
  stress_level: string
  hunger_level: string
  motivation_level: string
  digestion: string
  pain_injuries: string
  cardio_completed: string
  additional_notes: string
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

export type SupportRequestCategory =
  | 'question'
  | 'diet_update'
  | 'workout_update'
  | 'pain_injury'
  | 'general'

export type SupportRequestStatus = 'open' | 'claimed' | 'closed'

export type SupportRequestPriority = 'low' | 'normal' | 'high' | 'urgent'

export type SupportSenderType = 'client' | 'coach'

export type SupportRequest = {
  id: string
  client_id: string
  category: SupportRequestCategory
  title: string
  message: string
  status: SupportRequestStatus
  claimed_by: string | null
  claimed_at: string | null
  closed_at: string | null
  priority: SupportRequestPriority
  client_age?: string | null
  client_gender?: string | null
  client_goal?: string | null
  created_at: string
  updated_at: string
}

export type SupportMessage = {
  id: string
  request_id: string
  sender_type: SupportSenderType
  sender_id: string
  message: string
  created_at: string
}

export type SupportRequestWithClient = SupportRequest & {
  profiles?: Pick<Profile, 'name' | 'email' | 'age' | 'gender' | 'fitness_goal'> | null
  coaches?: Pick<Coach, 'name'> | null
}

export type SupportRequestFormData = {
  category: SupportRequestCategory
  title: string
  message: string
  priority: SupportRequestPriority
}

export type AiGenerationLog = {
  id: string
  client_id: string | null
  coach_id: string | null
  action: string
  model: string | null
  prompt_version: string
  latency_ms: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  retry_count: number
  validation_result: string | null
  success: boolean
  knowledge_refs: string[] | null
  input_cost_usd: number | null
  output_cost_usd: number | null
  total_cost_usd: number | null
  raw_output: unknown | null
  rendered_output: unknown | null
  created_at: string
}

export type PurchaseWithProfile = Purchase & {
  profiles?: Pick<Profile, 'id' | 'name' | 'email' | 'coach_id' | 'onboarding_complete' | 'plan_delivered'> | null
}

export type PurchaseDetail = PurchaseWithProfile & {
  coach?: Pick<Coach, 'id' | 'name'> | null
  plans: Plan[]
  support_requests: SupportRequest[]
  checkins: Checkin[]
}

export type AiGenerationLogWithRelations = AiGenerationLog & {
  profiles?: Pick<Profile, 'name' | 'email'> | null
  coaches?: Pick<Coach, 'name'> | null
}

export type PlatformNotificationChannel = 'email' | 'in_app' | 'sms'

export type PlatformNotificationStatus = 'draft' | 'scheduled' | 'sent' | 'failed'

export type PlatformNotification = {
  id: string
  template_key: string
  channel: PlatformNotificationChannel
  subject: string | null
  body: string
  status: PlatformNotificationStatus
  recipient_id: string | null
  metadata: Record<string, unknown> | null
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type PromptLibraryCategory =
  | 'system_prompt'
  | 'initial_diet'
  | 'initial_workout'
  | 'initial_workout_home'
  | 'weekly_diet_update'
  | 'weekly_workout_update'
  | 'weekly_workout_update_home'
  | 'mid_week_analysis'
  | 'coach_message'
  | 'future_prompts'

export type PromptVersionStatus = 'draft' | 'published' | 'archived'

export type PromptLibrary = {
  id: string
  slug: string
  name: string
  category: PromptLibraryCategory
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type PromptLibraryVersion = {
  id: string
  prompt_id: string
  version: number
  status: PromptVersionStatus
  prompt_body: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

export type PromptLibraryListItem = PromptLibrary & {
  current_version: number | null
  list_status: 'draft' | 'published' | 'archived'
  last_version_updated: string | null
  draft_version: PromptLibraryVersion | null
  published_version: PromptLibraryVersion | null
}

export type PromptLibraryWithVersions = PromptLibrary & {
  versions: PromptLibraryVersion[]
  draft_version: PromptLibraryVersion | null
  published_version: PromptLibraryVersion | null
}

export type PromptLibraryFormData = {
  name: string
  slug: string
  category: PromptLibraryCategory
  description: string
  prompt_body: string
}

export type PromptLibraryStats = {
  total: number
  drafts: number
  published: number
  lastUpdated: string | null
}

// ─── Launch sprint types ───

export type RedemptionCode = {
  id: string
  code: string
  plan_slug: string
  duration_months: number
  max_redemptions: number
  remaining_uses: number
  expires_at: string | null
  is_active: boolean
  is_reusable: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RedemptionUsage = {
  id: string
  code_id: string
  user_id: string
  redeemed_at: string
}

export type ConversationStatus = 'connecting' | 'active' | 'closed'
export type MessageType = 'text' | 'image' | 'voice' | 'system'
export type MessageSender = 'client' | 'coach' | 'system'

export type CoachConversation = {
  id: string
  client_id: string
  coach_id: string
  status: ConversationStatus
  unread_by_client: number
  unread_by_coach: number
  last_message_at: string | null
  last_message_preview: string | null
  client_typing_at: string | null
  coach_typing_at: string | null
  created_at: string
  updated_at: string
}

export type ConversationMessage = {
  id: string
  conversation_id: string
  sender_type: MessageSender
  sender_id: string | null
  message_type: MessageType
  content: string | null
  media_url: string | null
  media_duration_seconds: number | null
  read_at: string | null
  created_at: string
}

export type NotificationType =
  | 'plan_delivered'
  | 'coach_replied'
  | 'weekly_checkin_reminder'
  | 'mid_week_checkin_reminder'
  | 'checkin_submitted'
  | 'support_reply'
  | 'coach_assigned'
  | 'welcome'
  | 'progress_milestone'
  | 'unread_chat'
  | 'issue_update'
  | 'plan_available'
  | 'missed_checkin'

export type UserNotification = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  read_at: string | null
  action_url: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type IssueStatus = 'open' | 'investigating' | 'resolved' | 'closed'
export type IssueCategory = 'bug' | 'feature' | 'account' | 'billing' | 'other'

export type IssueReport = {
  id: string
  client_id: string
  category: IssueCategory | null
  description: string
  screenshot_url: string | null
  system_info: Record<string, unknown> | null
  status: IssueStatus
  admin_notes: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type CoachRatingValue = 'very_helpful' | 'helpful' | 'needs_improvement'

export type CoachReplyRating = {
  id: string
  message_id: string
  client_id: string
  coach_id: string
  rating: CoachRatingValue
  comment: string | null
  created_at: string
}
