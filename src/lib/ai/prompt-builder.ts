import type { ComplexityScoreResult } from '@/lib/ai/complexity-score'
import {
  formatMesocyclePromptSection,
  resolveMesocycle,
  summarizePriorSplit,
} from '@/lib/ai/mesocycle'
import { buildMetabolicFluxSection } from '@/lib/ai/metabolic-flux'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import { resolveWorkoutEnvironment } from '@/lib/ai/workout-prompt-selection'
import { getOnboardingLabel } from '@/lib/onboarding'
import { clientCoachNotes } from '@/lib/plan-metadata'
import type {
  AiKnowledge,
  AiKnowledgeCategory,
  Checkin,
  OnboardingData,
  OnboardingProfile,
  Plan,
} from '@/types/database'

/**
 * Goal → knowledge category mapping.
 * Add new goals here without changing prompt assembly logic.
 */
export const GOAL_KNOWLEDGE_CATEGORIES: Record<string, readonly AiKnowledgeCategory[]> = {
  fat_loss: ['fat_loss', 'nutrition', 'cardio', 'recovery'],
  muscle_gain: ['muscle_gain', 'nutrition', 'supplements', 'recovery'],
  recomposition: ['recomposition', 'nutrition', 'cardio', 'recovery'],
  strength: ['strength', 'nutrition', 'recovery'],
  athletic_performance: ['strength', 'cardio', 'nutrition', 'recovery'],
}

/** Default categories when fitness goal is missing or unmapped. */
export const DEFAULT_GOAL_KNOWLEDGE_CATEGORIES: readonly AiKnowledgeCategory[] = [
  'nutrition',
  'recovery',
]

/** Training experience value → knowledge category (1:1). */
export const TRAINING_KNOWLEDGE_CATEGORY: Record<string, AiKnowledgeCategory> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
}

export type PromptBuilderInput = {
  profile: OnboardingProfile
  latestCheckin?: Checkin | null
  complexityScore: ComplexityScoreResult
  knowledgeEntries: AiKnowledge[]
  coachInstructions?: string | null
  activePlan?: Plan | null
  /** Newly generated diet for weekly workout updates (nutrition only). */
  updatedDietPlan?: Plan | null
  actionId?: CoachAiActionId
  /** Published Prompt Library template for the action (user prompt). */
  actionTemplate?: string | null
  /** Published Prompt Library system template. */
  systemTemplate?: string | null
}

export type PromptBuilderResult = {
  systemPrompt: string
  userPrompt: string
  selectedKnowledge: string[]
  estimatedTokens: number
}

type ProfileForSelection = Pick<
  OnboardingProfile,
  'fitness_goal' | 'gender' | 'training_experience' | 'injuries'
>

function hasMeaningfulText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

/**
 * Determine which knowledge categories apply to a client profile.
 * Pure, deterministic, and unit-testable.
 */
export function selectKnowledgeCategories(profile: ProfileForSelection): AiKnowledgeCategory[] {
  const selected = new Set<AiKnowledgeCategory>()

  const goal = profile.fitness_goal ?? ''
  const goalCategories = GOAL_KNOWLEDGE_CATEGORIES[goal] ?? DEFAULT_GOAL_KNOWLEDGE_CATEGORIES
  for (const category of goalCategories) {
    selected.add(category)
  }

  if (hasMeaningfulText(profile.injuries)) {
    selected.add('injuries')
  }

  if (profile.gender === 'female') {
    selected.add('female')
  }

  const trainingCategory = profile.training_experience
    ? TRAINING_KNOWLEDGE_CATEGORY[profile.training_experience]
    : undefined
  if (trainingCategory) {
    selected.add(trainingCategory)
  }

  return Array.from(selected).sort()
}

/** Filter and order knowledge entries to match selected categories. */
export function filterKnowledgeEntries(
  entries: AiKnowledge[],
  categories: AiKnowledgeCategory[]
): AiKnowledge[] {
  const categorySet = new Set(categories)

  return entries
    .filter((entry) => entry.active && categorySet.has(entry.category))
    .sort((a, b) => {
      const categoryCompare = a.category.localeCompare(b.category)
      if (categoryCompare !== 0) return categoryCompare
      return b.version - a.version
    })
}

/** Rough token estimate (~4 characters per token for English prose). */
export function estimateTokens(...texts: string[]): number {
  const combined = texts.join('')
  if (!combined) return 0
  return Math.ceil(combined.length / 4)
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Not provided'
  return String(value)
}

function buildClientProfileSection(profile: OnboardingProfile): string {
  const lines = [
    '## Client Profile',
    `- Name: ${formatValue(profile.name)}`,
    `- Age: ${formatValue(profile.age)}`,
    `- Gender: ${getOnboardingLabel('gender', profile.gender)}`,
    `- Height: ${formatValue(profile.height)} cm`,
    `- Weight: ${formatValue(profile.weight)} kg`,
    `- Chest: ${formatValue(profile.onboarding_data?.measurements?.chest)} cm`,
    `- Thigh: ${formatValue(profile.onboarding_data?.measurements?.thigh)} cm`,
    `- Belly (navel): ${formatValue(profile.onboarding_data?.measurements?.navel)} cm`,
    `- Fitness goal: ${getOnboardingLabel('fitness_goal', profile.fitness_goal)}`,
    `- Training experience: ${getOnboardingLabel('training_experience', profile.training_experience)}`,
    `- Activity level: ${getOnboardingLabel('activity_level', profile.activity_level)}`,
    `- Diet preference: ${getOnboardingLabel('diet_preference', profile.diet_preference)}`,
    `- Sleep duration: ${getOnboardingLabel('sleep_duration', profile.sleep_duration)}`,
    `- Injuries: ${hasMeaningfulText(profile.injuries) ? profile.injuries!.trim() : 'None reported'}`,
    `- Medical notes: ${hasMeaningfulText(profile.medical_notes) ? profile.medical_notes!.trim() : 'None reported'}`,
  ]
  return lines.join('\n')
}

function buildCheckinSection(checkin: Checkin): string {
  const lines = [
    '## Latest Check-In',
    `- Submitted: ${checkin.submitted_at}`,
    `- Coaching week: ${formatValue(checkin.coaching_week)}`,
    `- Coaching day: ${formatValue(checkin.coaching_day)}`,
    `- Check-in type: ${formatValue(checkin.checkin_type)}`,
    `- Weight: ${formatValue(checkin.weight)} kg`,
    `- Chest: ${formatValue(checkin.chest)} cm`,
    `- Thigh: ${formatValue(checkin.thigh)} cm`,
    `- Belly (navel): ${formatValue(checkin.navel ?? checkin.waist)} cm`,
    `- Progress rating: ${formatValue(checkin.progress_rating)}/10`,
    `- Progress notes: ${hasMeaningfulText(checkin.progress_notes) ? checkin.progress_notes!.trim() : 'None'}`,
    `- Energy level: ${formatValue(checkin.energy_level)}/10`,
    `- Hunger level: ${formatValue(checkin.hunger_level)}/10`,
    `- Diet adherence: ${formatValue(checkin.diet_adherence)}/10`,
    `- Workout adherence: ${formatValue(checkin.workout_adherence)}/10`,
    `- Training performance: ${formatValue(checkin.training_performance)}/10`,
    `- Adherence score: ${formatValue(checkin.adherence_score)}/10`,
    `- Adherence wins: ${hasMeaningfulText(checkin.adherence_wins) ? checkin.adherence_wins!.trim() : 'None'}`,
    `- Adherence struggles: ${hasMeaningfulText(checkin.adherence_struggles) ? checkin.adherence_struggles!.trim() : 'None'}`,
    `- Notes: ${hasMeaningfulText(checkin.notes) ? checkin.notes!.trim() : 'None'}`,
  ]
  return lines.join('\n')
}

function buildMesocycleSection(
  checkin: Checkin | null | undefined,
  activePlan: Plan | null | undefined
): string {
  const week = checkin?.coaching_week ?? 1
  const meso = resolveMesocycle(week)
  const prior = summarizePriorSplit(activePlan?.workout_plan)
  return formatMesocyclePromptSection(meso, prior)
}

function buildComplexitySection(complexityScore: ComplexityScoreResult): string {
  const lines = [
    '## Complexity Assessment',
    `- Score: ${complexityScore.score}`,
    `- Tier: ${complexityScore.tier}`,
    `- Factors:`,
    ...complexityScore.reasoning.map((reason) => `  - ${reason}`),
  ]
  return lines.join('\n')
}

function buildKnowledgeSection(entries: AiKnowledge[]): string {
  if (entries.length === 0) {
    return '## Coaching Knowledge Base\nNo matching knowledge entries were provided.'
  }

  const sections = entries.map((entry) => {
    return [
      `### ${entry.title} (${entry.category}, v${entry.version})`,
      entry.content.trim(),
    ].join('\n')
  })

  return ['## Coaching Knowledge Base', ...sections].join('\n\n')
}

function buildSystemPrompt(
  complexityScore: ComplexityScoreResult,
  knowledgeEntries: AiKnowledge[]
): string {
  const sections = [
    [
      '# Role',
      'You are an expert fitness coaching assistant for an online coaching platform.',
      'Provide evidence-based, practical guidance aligned with the coaching knowledge base.',
      'Prioritize client safety, sustainability, and adherence.',
    ].join('\n'),
    [
      '# Complexity Context',
      `This client is classified as ${complexityScore.tier} complexity (score: ${complexityScore.score}).`,
      complexityScore.tier === 'HIGH'
        ? 'Apply extra caution with medical considerations, progressive adjustments, and clear rationale.'
        : complexityScore.tier === 'MEDIUM'
          ? 'Balance personalization with clear, actionable recommendations.'
          : 'Keep recommendations straightforward and easy to follow.',
    ].join('\n'),
    [
      '# Response Guidelines',
      '- Use the coaching knowledge base as your primary reference.',
      '- Tailor advice to the client profile and latest check-in data.',
      '- Be specific and actionable; avoid generic filler.',
      '- Flag when professional medical clearance may be needed.',
      '- Do not invent facts not supported by the provided context.',
    ].join('\n'),
    buildKnowledgeSection(knowledgeEntries),
  ]

  return sections.join('\n\n')
}

function buildOnboardingSection(data: OnboardingData | null | undefined): string {
  if (!data) {
    return '## Onboarding Answers\nNo extended onboarding data on file.'
  }

  const lines: string[] = ['## Onboarding Answers']

  if (data.goals) {
    const goalLine = data.goals.aiSelectedGoal
      ? `Goals: AI-selected goal (${data.goals.inferredGoal ?? 'pending'}), deadline ${data.goals.deadline ?? '—'}, struggle ${data.goals.biggestStruggle ?? '—'}`
      : `Goals: deadline ${data.goals.deadline ?? '—'}, struggle ${data.goals.biggestStruggle ?? '—'}`
    lines.push(goalLine)
  }
  if (data.lifestyle) {
    lines.push(
      `Lifestyle: occupation ${data.lifestyle.occupation ?? '—'}, schedule ${data.lifestyle.workSchoolSchedule ?? '—'}, steps ${data.lifestyle.dailySteps ?? '—'}, stress ${data.lifestyle.stressLevel ?? '—'}, water ${data.lifestyle.waterIntake ?? '—'}, flux capacity ${data.lifestyle.fluxCapacity ?? '—'}, diet variety ${data.lifestyle.dietVariety ?? '—'}`
    )
  }
  if (data.measurements) {
    lines.push(
      `Body measurements: chest ${data.measurements.chest ?? '—'} cm, thigh ${data.measurements.thigh ?? '—'} cm, belly at navel ${data.measurements.navel ?? '—'} cm`
    )
  }
  if (data.training) {
    const favorite = data.training.favoriteExercises?.trim()
    const disliked = data.training.exercisesDisliked?.trim()
    lines.push(
      `Training: location ${data.training.location ?? '—'}, days/week ${data.training.daysPerWeek ?? '—'}, duration ${data.training.durationMinutes ?? '—'}, preferred time ${data.training.preferredTime ?? '—'}, equipment ${(data.training.equipmentAvailable ?? []).join(', ') || '—'}${favorite ? `, favorite exercises ${favorite}` : ''}${disliked ? `, exercises to avoid ${disliked}` : ''}`
    )
  }
  if (data.medical) {
    lines.push(
      `Medical intake: conditions ${data.medical.conditions ?? '—'}, pain ${data.medical.painDuringExercise ?? '—'}, medications ${data.medical.medications ?? '—'}, acne ${data.medical.acne ?? '—'}, hair loss ${data.medical.hairLoss ?? '—'}, sexual health ${data.medical.sexualHealth ?? '—'}`
    )
    lines.push(
      'Note: Medical intake is informational only. Never diagnose conditions. Consider acne, hair loss, and sexual health when suggesting diet, supplements, recovery, or hormone-related recommendations.'
    )
  }
  if (data.diet) {
    lines.push(
      `Diet habits: allergies ${data.diet.allergies ?? '—'}, dislikes ${data.diet.foodsDisliked ?? '—'}, favorites ${data.diet.favoriteFoods ?? '—'}, budget ${data.diet.monthlyFoodBudget ?? '—'}, meal variety preference ${data.lifestyle?.dietVariety ?? '—'}`
    )
  }
  if (data.eatingPattern) {
    lines.push(
      `Eating pattern: breakfast ${data.eatingPattern.breakfast ?? '—'}, lunch ${data.eatingPattern.lunch ?? '—'}, dinner ${data.eatingPattern.dinner ?? '—'}, snacks ${data.eatingPattern.snacks ?? '—'}`
    )
  }
  if (data.supplements?.current) {
    lines.push(`Current supplements: ${data.supplements.current}`)
  }

  return lines.join('\n')
}

function buildHardConstraintsSection(profile: OnboardingProfile): string {
  const data = profile.onboarding_data
  const training = data?.training
  const diet = data?.diet
  const environment = resolveWorkoutEnvironment(profile)
  const equipment = (training?.equipmentAvailable ?? []).filter(Boolean)
  const location = training?.location ?? 'gym'

  const lines = [
    '## Hard Constraints (MUST obey — never violate)',
    `- Diet preference: ${getOnboardingLabel('diet_preference', profile.diet_preference)} — this is non-negotiable for all meal options.`,
  ]

  if (profile.diet_preference === 'vegetarian') {
    lines.push(
      '- VEGETARIAN: No chicken, fish, mutton, prawn, or eggs in any meal. Use dal, paneer, soya, chana, dairy, nuts only.'
    )
  } else if (profile.diet_preference === 'vegan') {
    lines.push(
      '- VEGAN: No animal products — no chicken, fish, eggs, dairy, whey, honey. Use plant proteins only.'
    )
  } else if (profile.diet_preference === 'eggetarian') {
    const eggDays = diet?.eggDaysPerWeek ?? '0'
    const eggWeekdays = (diet?.eggAllowedDays ?? []).filter(Boolean)
    lines.push(
      `- EGGETARIAN: Eggs only as animal protein — no chicken, fish, mutton, or prawn. Eggs ${eggDays} days/week${
        eggWeekdays.length > 0 ? ` on: ${eggWeekdays.join(', ')}` : ''
      } — schedule egg meals only on those weekdays.`
    )
  } else if (profile.diet_preference === 'non_vegetarian') {
    const eggDays = diet?.eggDaysPerWeek ?? '0'
    const chickenDays = diet?.chickenDaysPerWeek ?? '0'
    const fishDays = diet?.fishDaysPerWeek ?? '0'
    const eggWeekdays = (diet?.eggAllowedDays ?? []).filter(Boolean)
    const chickenWeekdays = (diet?.chickenAllowedDays ?? []).filter(Boolean)
    const fishWeekdays = (diet?.fishAllowedDays ?? []).filter(Boolean)
    lines.push(
      `- NON-VEGETARIAN day counts: eggs ${eggDays}/week, chicken ${chickenDays}/week, fish ${fishDays}/week — respect exactly.`
    )
    if (eggWeekdays.length > 0) {
      lines.push(`- Eggs allowed only on: ${eggWeekdays.join(', ')}.`)
    }
    if (chickenWeekdays.length > 0) {
      lines.push(`- Chicken allowed only on: ${chickenWeekdays.join(', ')}. Do not schedule chicken on other weekdays.`)
    }
    if (fishWeekdays.length > 0) {
      lines.push(`- Fish allowed only on: ${fishWeekdays.join(', ')}. Do not schedule fish on other weekdays.`)
    }
  }

  if (diet?.allergies?.trim() && diet.allergies.toLowerCase() !== 'none') {
    lines.push(`- Allergies (NEVER include): ${diet.allergies.trim()}`)
  }
  if (diet?.foodsDisliked?.trim()) {
    lines.push(`- Foods disliked (NEVER include): ${diet.foodsDisliked.trim()}`)
  }
  if (diet?.monthlyFoodBudget?.trim()) {
    lines.push(`- Monthly food budget: ₹${diet.monthlyFoodBudget} — stay within this; prioritize affordable staples.`)
  }

  if (environment === 'home') {
    lines.push(
      `- HOME WORKOUT ONLY: Use only equipment listed — ${equipment.length > 0 ? equipment.join(', ') : 'bodyweight only'}. NEVER prescribe barbell, smith machine, leg press, cable machines, or commercial gym equipment unless listed.`
    )
  } else if (location === 'gym' || location === 'both') {
    lines.push('- GYM: Full commercial gym equipment is available unless client listed limitations.')
  }

  if (training?.daysPerWeek) {
    lines.push(`- Training days per week: ${training.daysPerWeek} — program must match this exactly, not more.`)
  }
  if (training?.favoriteExercises?.trim()) {
    lines.push(`- Include preferred exercises where appropriate: ${training.favoriteExercises.trim()}`)
  }
  if (training?.exercisesDisliked?.trim()) {
    lines.push(`- Exercises to AVOID entirely (do not mention or prescribe): ${training.exercisesDisliked.trim()}`)
  }
  if (hasMeaningfulText(profile.injuries)) {
    lines.push(`- Injury/limitation (modify all exercises accordingly): ${profile.injuries!.trim()}`)
  }
  if (hasMeaningfulText(profile.medical_notes)) {
    lines.push(`- Medical notes: ${profile.medical_notes!.trim()}`)
  }

  return lines.join('\n')
}

function buildTrainingPreferencesSection(profile: OnboardingProfile): string {
  const data = profile.onboarding_data
  const training = data?.training
  const environment = resolveWorkoutEnvironment(profile)
  const location = training?.location ?? null
  const equipment = (training?.equipmentAvailable ?? []).filter(Boolean)

  const lines = [
    '## Training Preferences',
    `- Workout environment: ${environment === 'gym' ? 'Full Gym' : 'Home Workout'}`,
    `- Training location: ${location ? getOnboardingLabel('training_location', location) : 'Not provided'}`,
    `- Days per week: ${training?.daysPerWeek ?? 'Not provided'}`,
    `- Session duration: ${training?.durationMinutes ? `${training.durationMinutes} min` : 'Not provided'}`,
    `- Preferred workout time: ${training?.preferredTime ? getOnboardingLabel('preferred_workout_time', training.preferredTime) : 'Not provided'}`,
    `- Available equipment: ${equipment.length > 0 ? equipment.join(', ') : location === 'gym' ? 'Full commercial gym' : 'None / bodyweight only'}`,
    `- Favorite exercises / exercises to include: ${training?.favoriteExercises?.trim() || 'None specified'}`,
    `- Exercises to avoid: ${training?.exercisesDisliked?.trim() || 'None specified'}`,
    `- Training experience: ${getOnboardingLabel('training_experience', profile.training_experience)}`,
  ]

  return lines.join('\n')
}

function buildActivePlanSection(plan: Plan | null | undefined): string {
  if (!plan) {
    return '## Current Active Plan\nNo active plan on file.'
  }

  const sections = [
    '## Current Active Plan',
    `- Title: ${plan.title}`,
    plan.phase ? `- Phase: ${plan.phase}` : null,
    `- Version: ${plan.version}`,
    plan.nutrition_plan ? `### Nutrition\n${plan.nutrition_plan.trim()}` : null,
    plan.workout_plan ? `### Workout\n${plan.workout_plan.trim()}` : null,
    plan.cardio_plan ? `### Cardio\n${plan.cardio_plan.trim()}` : null,
    plan.supplement_plan ? `### Supplements\n${plan.supplement_plan.trim()}` : null,
    plan.coach_notes ? `### Coach Notes\n${clientCoachNotes(plan.coach_notes)}` : null,
  ].filter((section): section is string => Boolean(section))

  return sections.join('\n\n')
}

function buildActiveDietSection(plan: Plan | null | undefined): string {
  if (!plan) {
    return '## Current Active Diet\nNo active diet on file.'
  }

  const sections = [
    '## Current Active Diet',
    `- Title: ${plan.title}`,
    plan.phase ? `- Phase: ${plan.phase}` : null,
    `- Version: ${plan.version}`,
    plan.nutrition_plan
      ? `### Nutrition\n${plan.nutrition_plan.trim()}`
      : '### Nutrition\nNo nutrition plan on file.',
    plan.cardio_plan ? `### Cardio\n${plan.cardio_plan.trim()}` : null,
    plan.supplement_plan ? `### Supplements\n${plan.supplement_plan.trim()}` : null,
  ].filter((section): section is string => Boolean(section))

  return sections.join('\n\n')
}

function buildActiveWorkoutSection(plan: Plan | null | undefined): string {
  if (!plan) {
    return '## Current Active Workout\nNo active workout on file.'
  }

  const sections = [
    '## Current Active Workout',
    `- Title: ${plan.title}`,
    plan.phase ? `- Phase: ${plan.phase}` : null,
    `- Version: ${plan.version}`,
    plan.workout_plan
      ? `### Workout\n${plan.workout_plan.trim()}`
      : '### Workout\nNo workout plan on file.',
    plan.cardio_plan ? `### Cardio\n${plan.cardio_plan.trim()}` : null,
  ].filter((section): section is string => Boolean(section))

  return sections.join('\n\n')
}

function buildUpdatedDietSection(plan: Plan | null | undefined): string {
  if (!plan?.nutrition_plan?.trim()) {
    return '## Newly Generated Updated Diet\nNo updated diet is available. Generate the diet update before the workout update.'
  }

  const sections = [
    '## Newly Generated Updated Diet',
    `- Title: ${plan.title}`,
    plan.phase ? `- Phase: ${plan.phase}` : null,
    `### Nutrition\n${plan.nutrition_plan.trim()}`,
    plan.cardio_plan ? `### Cardio\n${plan.cardio_plan.trim()}` : null,
    plan.supplement_plan ? `### Supplements\n${plan.supplement_plan.trim()}` : null,
    plan.coach_notes ? `### Coach Notes\n${clientCoachNotes(plan.coach_notes)}` : null,
  ].filter((section): section is string => Boolean(section))

  return sections.join('\n\n')
}

export type PromptContextSections = {
  clientDetails: string
  onboarding: string
  metabolicFlux: string
  hardConstraints: string
  trainingPreferences: string
  activePlan: string
  activeDiet: string
  activeWorkout: string
  updatedDiet: string
  checkin: string
  mesocycle: string
  coachNotes: string
  knowledge: string
  complexity: string
}

export type PromptContextSectionKey = keyof PromptContextSections

const SECTION_LABELS: Record<PromptContextSectionKey, string> = {
  clientDetails: 'Client Profile',
  onboarding: 'Onboarding',
  metabolicFlux: 'Metabolic Flux Bias',
  hardConstraints: 'Hard Constraints',
  trainingPreferences: 'Training Preferences',
  activePlan: 'Current Active Plan',
  activeDiet: 'Current Active Diet',
  activeWorkout: 'Current Active Workout',
  updatedDiet: 'Newly Generated Updated Diet',
  checkin: 'Weekly Check-in',
  mesocycle: 'Training Mesocycle',
  coachNotes: 'Coach Notes',
  knowledge: 'Knowledge Base',
  complexity: 'Complexity Score',
}

/** Inspect which context sections appear in assembled prompts (for audits). */
export function analyzeInjectedContext(input: {
  systemPrompt: string
  userPrompt: string
  sections: PromptContextSections
  actionId?: CoachAiActionId
}): {
  inSystem: PromptContextSectionKey[]
  inUser: PromptContextSectionKey[]
  appendedToUser: PromptContextSectionKey[]
  missingSubstantive: PromptContextSectionKey[]
  duplicated: PromptContextSectionKey[]
} {
  const corpus = `${input.systemPrompt}\n${input.userPrompt}`
  const keys = Object.keys(SECTION_LABELS) as PromptContextSectionKey[]

  const inSystem: PromptContextSectionKey[] = []
  const inUser: PromptContextSectionKey[] = []
  const duplicated: PromptContextSectionKey[] = []

  for (const key of keys) {
    const section = input.sections[key]
    if (!hasSubstantiveContext(section)) continue

    const inSys = sectionWasInjected(input.systemPrompt, section)
    const inUsr = sectionWasInjected(input.userPrompt, section)
    if (inSys) inSystem.push(key)
    if (inUsr) inUser.push(key)
    if (inSys && inUsr) duplicated.push(key)
  }

  const required = resolveAppendOrder(input.actionId)
  const missingSubstantive = required.filter((key) => {
    const section = input.sections[key]
    return hasSubstantiveContext(section) && !sectionWasInjected(corpus, section)
  })

  const appendedToUser = inUser.filter((key) => !inSystem.includes(key))

  return { inSystem, inUser, appendedToUser, missingSubstantive, duplicated }
}

export function formatContextSectionLabel(key: PromptContextSectionKey): string {
  return SECTION_LABELS[key]
}

/** Build injectable context blocks for Prompt Library placeholder replacement. */
export function buildPromptContextSections(
  input: Omit<PromptBuilderInput, 'actionTemplate' | 'systemTemplate'> & {
    knowledgeEntries: AiKnowledge[]
  }
): PromptContextSections {
  const categories = selectKnowledgeCategories(input.profile)
  const selectedEntries = filterKnowledgeEntries(input.knowledgeEntries, categories)

  return {
    clientDetails: buildClientProfileSection(input.profile),
    onboarding: buildOnboardingSection(input.profile.onboarding_data),
    metabolicFlux: buildMetabolicFluxSection(input.profile),
    hardConstraints: buildHardConstraintsSection(input.profile),
    trainingPreferences: buildTrainingPreferencesSection(input.profile),
    activePlan: buildActivePlanSection(input.activePlan),
    activeDiet: buildActiveDietSection(input.activePlan),
    activeWorkout: buildActiveWorkoutSection(input.activePlan),
    updatedDiet: buildUpdatedDietSection(input.updatedDietPlan),
    checkin: input.latestCheckin
      ? buildCheckinSection(input.latestCheckin)
      : '## Latest Check-In\nNo check-in provided for this request.',
    mesocycle: buildMesocycleSection(input.latestCheckin, input.activePlan),
    coachNotes: hasMeaningfulText(input.coachInstructions)
      ? ['## Coach Notes', input.coachInstructions!.trim()].join('\n')
      : '## Coach Notes\nNone provided.',
    knowledge: buildKnowledgeSection(selectedEntries),
    complexity: buildComplexitySection(input.complexityScore),
  }
}

const PLACEHOLDER_ALIASES: Record<string, keyof PromptContextSections> = {
  '[CLIENT DETAILS]': 'clientDetails',
  '[CLIENT PROFILE]': 'clientDetails',
  '[PASTE CLIENT DETAILS HERE]': 'clientDetails',
  '[ONBOARDING ANSWERS]': 'onboarding',
  '[ONBOARDING DATA]': 'onboarding',
  '[METABOLIC FLUX]': 'metabolicFlux',
  '[METABOLIC FLUX BIAS]': 'metabolicFlux',
  '[FLUX BIAS]': 'metabolicFlux',
  '[HARD CONSTRAINTS]': 'hardConstraints',
  '[NON-NEGOTIABLE CONSTRAINTS]': 'hardConstraints',
  '[TRAINING PREFERENCES]': 'trainingPreferences',
  '[WORKOUT PREFERENCES]': 'trainingPreferences',
  '[ACTIVE PLAN]': 'activePlan',
  '[CURRENT PLAN]': 'activePlan',
  '[CURRENT ACTIVE PLAN]': 'activePlan',
  '[ACTIVE DIET]': 'activeDiet',
  '[CURRENT ACTIVE DIET]': 'activeDiet',
  '[ACTIVE WORKOUT]': 'activeWorkout',
  '[CURRENT ACTIVE WORKOUT]': 'activeWorkout',
  '[UPDATED DIET]': 'updatedDiet',
  '[NEWLY GENERATED UPDATED DIET]': 'updatedDiet',
  '[WEEKLY CHECK-IN]': 'checkin',
  '[CHECK-IN]': 'checkin',
  '[LATEST CHECK-IN]': 'checkin',
  '[CHECK IN]': 'checkin',
  '[MESOCYCLE]': 'mesocycle',
  '[TRAINING MESOCYCLE]': 'mesocycle',
  '[COACH NOTES]': 'coachNotes',
  '[COACH INSTRUCTIONS]': 'coachNotes',
  '[KNOWLEDGE BASE]': 'knowledge',
  '[COMPLEXITY]': 'complexity',
  '[COMPLEXITY ASSESSMENT]': 'complexity',
  '[COMPLEXITY RESULT]': 'complexity',
}

/** Replace Prompt Library placeholders with assembled context. Does not alter template wording. */
export function injectPromptPlaceholders(template: string, sections: PromptContextSections): string {
  let output = template
  for (const [placeholder, key] of Object.entries(PLACEHOLDER_ALIASES)) {
    output = output.split(placeholder).join(sections[key])
    const loose = new RegExp(placeholder.replace(/[\[\]]/g, '\\$&'), 'gi')
    output = output.replace(loose, sections[key])
  }
  return output
}

function sectionWasInjected(prompt: string, section: string): boolean {
  if (!section.trim()) return true
  const marker = section.trim().slice(0, 48)
  return marker.length > 0 && prompt.includes(marker)
}

/** Skip placeholder-only sections that add noise without real client data. */
function hasSubstantiveContext(section: string): boolean {
  const trimmed = section.trim()
  if (!trimmed) return false

  const emptyMarkers = [
    '## Latest Check-In\nNo check-in provided',
    '## Onboarding Answers\nNo extended onboarding data',
    '## Coach Notes\nNone provided.',
    '## Current Active Plan\nNo active plan on file.',
    '## Current Active Diet\nNo active diet on file.',
    '## Current Active Workout\nNo active workout on file.',
    '## Newly Generated Updated Diet\nNo updated diet is available.',
  ]

  return !emptyMarkers.some((marker) => trimmed.startsWith(marker))
}

function resolveAppendOrder(actionId?: CoachAiActionId): (keyof PromptContextSections)[] {
  switch (actionId) {
    case 'initial_workout':
    case 'initial_cardio':
      return [
        'hardConstraints',
        'metabolicFlux',
        'clientDetails',
        'onboarding',
        'trainingPreferences',
        'mesocycle',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
    case 'review_update_diet':
    case 'review_update_supplements':
      return [
        'hardConstraints',
        'metabolicFlux',
        'clientDetails',
        'onboarding',
        'activeDiet',
        'activeWorkout',
        'checkin',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
    case 'review_update_workout':
    case 'review_update_cardio':
      return [
        'hardConstraints',
        'metabolicFlux',
        'clientDetails',
        'onboarding',
        'trainingPreferences',
        'activeWorkout',
        'activeDiet',
        'updatedDiet',
        'mesocycle',
        'checkin',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
    default:
      return [
        'hardConstraints',
        'metabolicFlux',
        'clientDetails',
        'onboarding',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
  }
}

/** Append context blocks that were not injected via placeholders. */
function appendMissingLibraryContext(
  userPrompt: string,
  systemPrompt: string,
  sections: PromptContextSections,
  actionId?: CoachAiActionId
): string {
  const injectedCorpus = `${systemPrompt}\n${userPrompt}`
  const extras = resolveAppendOrder(actionId)

  const blocks = extras
    .map((key) => sections[key])
    .filter(
      (section) =>
        hasSubstantiveContext(section) &&
        !sectionWasInjected(injectedCorpus, section)
    )

  if (blocks.length === 0) return userPrompt
  return [userPrompt, ...blocks].join('\n\n')
}

function buildPromptFromLibraryTemplates(
  input: PromptBuilderInput,
  selectedEntries: AiKnowledge[]
): PromptBuilderResult {
  const sections = buildPromptContextSections({ ...input, knowledgeEntries: selectedEntries })
  const categories = selectKnowledgeCategories(input.profile)

  const systemPrompt = input.systemTemplate?.trim()
    ? injectPromptPlaceholders(input.systemTemplate.trim(), sections)
    : buildSystemPrompt(input.complexityScore, selectedEntries)

  const userPrompt = appendMissingLibraryContext(
    injectPromptPlaceholders(input.actionTemplate!.trim(), sections),
    systemPrompt,
    sections,
    input.actionId
  )

  return {
    systemPrompt,
    userPrompt,
    selectedKnowledge: categories,
    estimatedTokens: estimateTokens(systemPrompt, userPrompt),
  }
}

function buildUserPrompt(
  profile: OnboardingProfile,
  latestCheckin: Checkin | null | undefined,
  complexityScore: ComplexityScoreResult,
  coachInstructions: string | null | undefined,
  activePlan?: Plan | null
): string {
  const sections = [
    buildClientProfileSection(profile),
    buildMesocycleSection(latestCheckin, activePlan),
    latestCheckin ? buildCheckinSection(latestCheckin) : null,
    buildComplexitySection(complexityScore),
    hasMeaningfulText(coachInstructions)
      ? ['## Coach Instructions', coachInstructions!.trim()].join('\n')
      : null,
    [
      '## Task',
      'Using the system knowledge base and client context above, provide personalized coaching guidance.',
      'Structure your response clearly with headings and bullet points where appropriate.',
    ].join('\n'),
  ].filter((section): section is string => section !== null)

  return sections.join('\n\n')
}

/**
 * Assemble system and user prompts for AI coaching flows.
 * Pure function — no database access, no model calls.
 */
export function buildPrompt(input: PromptBuilderInput): PromptBuilderResult {
  const categories = selectKnowledgeCategories(input.profile)
  const selectedEntries = filterKnowledgeEntries(input.knowledgeEntries, categories)

  if (input.actionTemplate?.trim()) {
    return buildPromptFromLibraryTemplates(input, selectedEntries)
  }

  const systemPrompt = buildSystemPrompt(input.complexityScore, selectedEntries)
  const userPrompt = buildUserPrompt(
    input.profile,
    input.latestCheckin,
    input.complexityScore,
    input.coachInstructions,
    input.activePlan
  )

  return {
    systemPrompt,
    userPrompt,
    selectedKnowledge: categories,
    estimatedTokens: estimateTokens(systemPrompt, userPrompt),
  }
}
