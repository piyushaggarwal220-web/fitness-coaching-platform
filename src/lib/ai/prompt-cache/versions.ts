import { createHash } from 'crypto'
import type { ComplexityScoreResult } from '@/lib/ai/complexity-score'
import { clientCoachNotes } from '@/lib/plan-metadata'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

export function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${k}:${stableStringify(obj[k])}`).join(',')}}`
}

export function knowledgeBaseVersion(entries: { category: string; version: number; active: boolean }[]): string {
  const sig = entries
    .filter((e) => e.active)
    .map((e) => `${e.category}:${e.version}`)
    .sort()
    .join('|')
  return `v${hashContent(sig || 'empty')}`
}

export function promptLibraryVersion(version: string): string {
  return version.replace(/\s+/g, '-')
}

export function clientProfileVersion(profile: OnboardingProfile): string {
  const sig = stableStringify({
    name: profile.name,
    age: profile.age,
    gender: profile.gender,
    height: profile.height,
    weight: profile.weight,
    fitness_goal: profile.fitness_goal,
    training_experience: profile.training_experience,
    activity_level: profile.activity_level,
    diet_preference: profile.diet_preference,
    sleep_duration: profile.sleep_duration,
    updated_at: profile.updated_at,
  })
  return `v${hashContent(sig)}`
}

export function onboardingVersion(profile: OnboardingProfile): string {
  const sig = stableStringify({
    onboarding_complete: profile.onboarding_complete,
    onboarding_completed_at: profile.onboarding_completed_at,
    onboarding_data: profile.onboarding_data,
  })
  return `v${hashContent(sig)}`
}

export function hardConstraintsVersion(profile: OnboardingProfile): string {
  const sig = stableStringify({
    diet_preference: profile.diet_preference,
    injuries: profile.injuries,
    medical_notes: profile.medical_notes,
    onboarding_data: {
      diet: profile.onboarding_data?.diet,
      medical: profile.onboarding_data?.medical,
      training: profile.onboarding_data?.training,
    },
    updated_at: profile.updated_at,
  })
  return `v${hashContent(sig)}`
}

export function trainingPreferencesVersion(profile: OnboardingProfile): string {
  const sig = stableStringify({
    training: profile.onboarding_data?.training,
    training_experience: profile.training_experience,
    updated_at: profile.updated_at,
  })
  return `v${hashContent(sig)}`
}

export function complexityVersion(
  clientId: string,
  score: ComplexityScoreResult,
  checkinAt?: string | null
): string {
  const sig = stableStringify({
    score: score.score,
    tier: score.tier,
    reasoning: score.reasoning,
    checkinAt: checkinAt ?? null,
  })
  return `${clientId}:v${hashContent(sig)}`
}

export function planSectionVersion(
  clientId: string,
  plan: Plan | null | undefined,
  field: 'nutrition_plan' | 'workout_plan' | 'full'
): string {
  if (!plan) return `${clientId}:vnone`
  const content =
    field === 'nutrition_plan'
      ? plan.nutrition_plan
      : field === 'workout_plan'
        ? plan.workout_plan
        : stableStringify({
            version: plan.version,
            title: plan.title,
            nutrition_plan: plan.nutrition_plan,
            workout_plan: plan.workout_plan,
            cardio_plan: plan.cardio_plan,
            supplement_plan: plan.supplement_plan,
            coach_notes: clientCoachNotes(plan.coach_notes),
            updated_at: plan.updated_at,
          })
  return `${clientId}:v${hashContent(content ?? '')}`
}

export function checkinVersion(clientId: string, checkin: Checkin | null | undefined): string {
  if (!checkin) return `${clientId}:vnone`
  const sig = stableStringify({
    id: checkin.id,
    submitted_at: checkin.submitted_at,
    weight: checkin.weight,
    adherence_score: checkin.adherence_score,
    energy_level: checkin.energy_level,
    notes: checkin.notes,
    coach_response: checkin.coach_response,
  })
  return `${clientId}:v${hashContent(sig)}`
}

export function coachNotesVersion(clientId: string, notes: string | null | undefined): string {
  return `${clientId}:v${hashContent(clientCoachNotes(notes) || 'none')}`
}

export function compiledPromptVersion(input: {
  clientId: string
  actionId?: string
  promptLibraryVersion: string | null
  blockVersions: Record<string, string>
  retry?: boolean
}): string {
  const sig = stableStringify({
    clientId: input.clientId,
    actionId: input.actionId ?? 'default',
    promptLibraryVersion: input.promptLibraryVersion,
    blocks: input.blockVersions,
    retry: input.retry ?? false,
  })
  return `${input.clientId}:v${hashContent(sig)}`
}
