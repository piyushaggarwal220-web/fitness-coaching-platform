import type { ComplexityScoreResult } from '@/lib/ai/complexity-score'
import { getOnboardingLabel } from '@/lib/onboarding'
import type { AiKnowledge, AiKnowledgeCategory, Checkin, OnboardingProfile } from '@/types/database'

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
    `- Weight: ${formatValue(checkin.weight)} kg`,
    `- Waist: ${formatValue(checkin.waist)} cm`,
    `- Energy level: ${formatValue(checkin.energy_level)}/10`,
    `- Hunger level: ${formatValue(checkin.hunger_level)}/10`,
    `- Training performance: ${formatValue(checkin.training_performance)}/10`,
    `- Adherence score: ${formatValue(checkin.adherence_score)}/10`,
    `- Notes: ${hasMeaningfulText(checkin.notes) ? checkin.notes!.trim() : 'None'}`,
  ]
  return lines.join('\n')
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

function buildUserPrompt(
  profile: OnboardingProfile,
  latestCheckin: Checkin | null | undefined,
  complexityScore: ComplexityScoreResult,
  coachInstructions: string | null | undefined
): string {
  const sections = [
    buildClientProfileSection(profile),
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

  const systemPrompt = buildSystemPrompt(input.complexityScore, selectedEntries)
  const userPrompt = buildUserPrompt(
    input.profile,
    input.latestCheckin,
    input.complexityScore,
    input.coachInstructions
  )

  return {
    systemPrompt,
    userPrompt,
    selectedKnowledge: categories,
    estimatedTokens: estimateTokens(systemPrompt, userPrompt),
  }
}
