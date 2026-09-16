import 'server-only'
import { MODELS } from '@/lib/ai/config'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import { getOnboardingLabel } from '@/lib/onboarding'
import type { OnboardingProfile } from '@/types/database'

export type GeneratedJourneyPlan = {
  journey_goal: string
  journey_summary: string
}

const OUTPUT_INSTRUCTIONS = [
  '# Output Format',
  'Respond with ONLY valid JSON — no markdown fences, no commentary.',
  '{ "journey_goal": "<multi-phase roadmap>", "journey_summary": "<where they start today>" }',
  '',
  'journey_goal: 2–5 sentences. Multi-phase coaching roadmap with approximate week ranges',
  '(e.g. weeks 1–8 fat loss, weeks 9–12 reverse, then maintenance). Mention calorie posture',
  '(deficit / reverse / maintenance) in plain language — no exact kcal numbers unless the client',
  'already stated a target. Honor injuries, diet preference, and experience level.',
  '',
  'journey_summary: 1–2 sentences for week 1 / day 1 — starting phase and first focus.',
].join('\n')

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Not provided'
  return String(value)
}

function buildClientContext(profile: OnboardingProfile): string {
  const goals = profile.onboarding_data?.goals
  const selected =
    goals?.selectedGoals && goals.selectedGoals.length > 0
      ? goals.selectedGoals.map((g) => getOnboardingLabel('fitness_goal', g)).join(', ')
      : getOnboardingLabel('fitness_goal', profile.fitness_goal)

  const lines = [
    '## Client',
    `- Name: ${formatValue(profile.name)}`,
    `- Age: ${formatValue(profile.age)}`,
    `- Gender: ${getOnboardingLabel('gender', profile.gender)}`,
    `- Height: ${formatValue(profile.height)} cm`,
    `- Weight: ${formatValue(profile.weight)} kg`,
    `- Fitness goals: ${selected}`,
    `- Training experience: ${getOnboardingLabel('training_experience', profile.training_experience)}`,
    `- Activity level: ${getOnboardingLabel('activity_level', profile.activity_level)}`,
    `- Diet preference: ${getOnboardingLabel('diet_preference', profile.diet_preference)}`,
    `- Injuries: ${profile.injuries?.trim() || 'None reported'}`,
    `- Medical notes: ${profile.medical_notes?.trim() || 'None reported'}`,
  ]

  if (goals?.targetWeight != null && String(goals.targetWeight).trim()) {
    lines.push(`- Target weight: ${goals.targetWeight} kg`)
  }
  if (goals?.deadline?.trim()) {
    lines.push(`- Goal deadline: ${goals.deadline.trim()}`)
  }
  if (goals?.startingBodyType?.trim()) {
    lines.push(`- Starting body type: ${goals.startingBodyType.trim()}`)
  }
  if (goals?.biggestStruggle?.trim()) {
    lines.push(`- Biggest struggle: ${goals.biggestStruggle.trim()}`)
  }

  const clientWords =
    profile.client_goal_details?.trim() ||
    goals?.goalDetails?.trim() ||
    null
  if (clientWords) {
    lines.push(`- Client goal description (their words): ${clientWords}`)
  }

  const lifestyle = profile.onboarding_data?.lifestyle
  if (lifestyle?.dailySteps?.trim()) {
    lines.push(`- Daily steps habit: ${lifestyle.dailySteps.trim()}`)
  }
  if (lifestyle?.fluxCapacity?.trim()) {
    lines.push(`- Energy flux capacity: ${lifestyle.fluxCapacity.trim()}`)
  }

  const training = profile.onboarding_data?.training
  if (training?.daysPerWeek != null) {
    lines.push(`- Training days/week: ${training.daysPerWeek}`)
  }
  if (training?.availableDays?.length) {
    lines.push(`- Available training days: ${training.availableDays.join(', ')}`)
  }

  return lines.join('\n')
}

function parseJourneyJson(text: string): GeneratedJourneyPlan {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? trimmed).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('Journey plan generation returned no JSON object.')
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<GeneratedJourneyPlan>
  const journey_goal = typeof parsed.journey_goal === 'string' ? parsed.journey_goal.trim() : ''
  const journey_summary =
    typeof parsed.journey_summary === 'string' ? parsed.journey_summary.trim() : ''
  if (!journey_goal) {
    throw new Error('Journey plan generation returned an empty journey_goal.')
  }
  return {
    journey_goal,
    journey_summary:
      journey_summary ||
      'Week 1 — starting the first phase of the roadmap; prioritize consistency and adherence.',
  }
}

function mockJourney(profile: OnboardingProfile): GeneratedJourneyPlan {
  const goal =
    getOnboardingLabel('fitness_goal', profile.fitness_goal) || 'body recomposition'
  return {
    journey_goal: `Weeks 1–8 focus on ${goal} with a moderate calorie deficit and progressive training. Weeks 9–12 begin a gradual reverse toward maintenance calories while keeping protein high. After week 12, hold maintenance and refine body composition.`,
    journey_summary: `Week 1 of the opening phase for ${goal} — establish diet adherence and training consistency before aggressive changes.`,
  }
}

/** AI-write journey_goal + journey_summary from onboarding (Piyush auto path). */
export async function generateJourneyPlan(
  profile: OnboardingProfile
): Promise<GeneratedJourneyPlan> {
  const mode = getPlanProviderMode()
  const userPrompt = [
    'Write the coach journey plan for this new client before their first diet/workout plan.',
    '',
    buildClientContext(profile),
  ].join('\n')

  const response = await callPlanProvider(mode, {
    systemPrompt: [
      'You are a senior online fitness coach writing the client journey plan (AI memory).',
      'This roadmap guides every later diet/workout update — be specific about phases, not vague.',
      'Do not invent medical diagnoses. Stay conservative when injuries or medical notes exist.',
      OUTPUT_INSTRUCTIONS,
    ].join('\n'),
    userPrompt,
    model: MODELS.GPT_LUNA,
    maxTokens: 1024,
    temperature: 0.4,
    mockText: JSON.stringify(mockJourney(profile)),
  })

  return parseJourneyJson(response.text)
}
