/**
 * Ensure AI-generated drafts include a client-facing coach message.
 * Uses the published coach_message prompt when diet/workout notes are empty.
 */
import { MODELS } from '@/lib/ai/config'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { calculateComplexityScore } from '@/lib/ai/complexity-score'
import { getAllKnowledge } from '@/lib/ai/knowledge'
import { compileCachedPrompt } from '@/lib/ai/prompt-cache'
import {
  formatLibraryPromptVersion,
  getPublishedPromptByCategory,
} from '@/lib/ai/prompt-library-loader'
import { buildMockGeneratedPlan } from '@/lib/ai/mock-plan-provider'
import {
  parseGeneratedPlanResponse,
  type GeneratedPlan,
} from '@/lib/ai/generate-plan'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import { profileToComplexityInput } from '@/lib/complexity/profile-input'
import { stripPlanMeta } from '@/lib/plan-metadata'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

const COACH_MESSAGE_OUTPUT_INSTRUCTIONS = [
  '# Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary.',
  'Use this structure with placeholder empty arrays:',
  '{ "workout_plan": { "overview": "N/A", "days": [] },',
  '  "nutrition_plan": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "meals": [] },',
  '  "cardio_plan": { "sessions": [] }, "supplement_plan": { "items": [] },',
  '  "coach_notes": "<warm client-facing message>" }',
  'coach_notes must be non-empty: encouragement, one win, one focus for next week.',
].join('\n')

function buildFallbackCoachMessage(profile: OnboardingProfile, checkin: Checkin): string {
  const name = profile.name?.trim() || 'there'
  const week = checkin.coaching_week ? `Week ${checkin.coaching_week}` : 'this week'
  return `Hi ${name} — great job checking in for ${week}. Keep building on your consistency, celebrate the wins you logged, and focus on one small improvement next week. Your coach is here if you need anything.`
}

export async function generateClientCoachMessage(input: {
  profile: OnboardingProfile
  checkin: Checkin
  activePlan?: Plan | null
  draftPlan?: Plan | null
  coachInstructions?: string | null
}): Promise<string> {
  const coachMessagePrompt = await getPublishedPromptByCategory('coach_message')
  if (!coachMessagePrompt) {
    throw new Error('No published Prompt Library entry for category "coach_message".')
  }

  const systemPrompt = await getPublishedPromptByCategory('system_prompt')
  const { data: knowledgeEntries, error: knowledgeError } = await getAllKnowledge()
  if (knowledgeError) {
    throw new Error(`Failed to load knowledge base: ${knowledgeError}`)
  }

  const complexityScore = calculateComplexityScore(
    profileToComplexityInput(input.profile, input.checkin)
  )

  const contextPlan = input.draftPlan ?? input.activePlan ?? null
  const { result: compiled } = await compileCachedPrompt({
    profile: input.profile,
    latestCheckin: input.checkin,
    complexityScore,
    knowledgeEntries,
    coachInstructions: input.coachInstructions,
    activePlan: contextPlan,
    actionTemplate: coachMessagePrompt.promptBody,
    systemTemplate: systemPrompt?.promptBody ?? null,
    clientId: input.profile.id,
    promptVersion: formatLibraryPromptVersion(coachMessagePrompt),
  })

  const system = `${compiled.systemPrompt}\n\n${COACH_MESSAGE_OUTPUT_INSTRUCTIONS}`
  const userPrompt = compiled.userPrompt
  const providerMode = getPlanProviderMode()
  const mockPlan = buildMockGeneratedPlan(input.profile, input.checkin, input.coachInstructions)
  const mockText = JSON.stringify({
    ...mockPlan,
    workout_plan: { overview: 'N/A', days: [] },
    nutrition_plan: { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] },
    cardio_plan: { sessions: [] },
    supplement_plan: { items: [] },
  } satisfies GeneratedPlan)

  const response = await callPlanProvider(providerMode, {
    systemPrompt: system,
    userPrompt,
    // Coach notes are short and template-backed — Haiku is enough.
    model: MODELS.CLAUDE_HAIKU,
    maxTokens: 1024,
    temperature: 0.4,
    mockText,
  })

  const { plan, error } = parseGeneratedPlanResponse(response.text, { mode: 'minimal' })
  if (error || !plan) {
    throw new ClaudeResponseError(error ?? 'Coach message generation returned invalid JSON.')
  }

  const message = stripPlanMeta(plan.coach_notes).trim()
  if (!message) {
    throw new Error('Coach message generation returned empty coach_notes.')
  }

  return message
}

/** Return existing client notes or generate a warm message when AI left coach_notes empty. */
export async function ensureClientCoachMessage(input: {
  profile: OnboardingProfile
  checkin: Checkin
  activePlan?: Plan | null
  draftPlan?: Plan | null
  mergedNotes?: string | null
  coachInstructions?: string | null
}): Promise<string> {
  const existing = stripPlanMeta(input.mergedNotes).trim()
  if (existing) return existing

  try {
    return await generateClientCoachMessage(input)
  } catch {
    return buildFallbackCoachMessage(input.profile, input.checkin)
  }
}
