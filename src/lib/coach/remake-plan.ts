import { loadClientJourneySnapshot } from '@/lib/ai/client-journey'
import { generatePlan, type PlanValidationMode } from '@/lib/ai/generate-plan'
import {
  generatedCardioFormData,
  generatedDietFormData,
  generatedSupplementFormData,
  generatedWorkoutFormData,
} from '@/lib/ai/plan-format'
import { FRESH_PLAN_OUTPUT_RULES } from '@/lib/ai/plan-prose-guards'
import {
  buildActionCoachInstructions,
  mergePlanForms,
  type CoachAiActionId,
} from '@/lib/coach/ai-actions'
import type { OnboardingProfile, PlanFormData } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export const REMAKE_PLAN_PREFIX = [
  FRESH_PLAN_OUTPUT_RULES,
  'REMAKE FROM SCRATCH: Ignore any current draft on file. Write a brand-new plan from the client profile and journey only.',
  'Do not reference, patch, or explain differences from a prior plan.',
].join('\n\n')

export const REMAKE_SECTION_INSTRUCTION = {
  nutrition:
    'Remake the diet plan completely from the client profile. Ignore the current draft text. Full 7-day plan with matching header and daily totals. No edit meta.',
  workout:
    'Remake the workout plan completely from the client profile. Ignore the current draft text. Full week with Day 1 (Monday) through Day 7. No edit meta.',
} as const

function validationMode(actionId: CoachAiActionId): PlanValidationMode {
  if (actionId === 'initial_workout') return 'workout_focus'
  if (actionId === 'initial_diet') return 'nutrition_focus'
  if (actionId === 'initial_cardio') return 'cardio_focus'
  if (actionId === 'initial_supplements') return 'supplements_focus'
  return 'full'
}

function buildRemakeCoachNote(custom?: string | null): string {
  return [REMAKE_PLAN_PREFIX, custom?.trim()].filter(Boolean).join('\n\n')
}

async function generateRemakeSection(
  profile: OnboardingProfile,
  actionId: CoachAiActionId,
  coachNote: string,
  clientJourney: string | null
): Promise<PlanFormData> {
  const result = await generatePlan({
    profile,
    latestCheckin: null,
    coachInstructions: buildActionCoachInstructions(actionId, {
      coachNote,
      activePlan: null,
      checkin: null,
    }),
    validationMode: validationMode(actionId),
    actionId,
    activePlan: null,
    clientJourney,
  })

  if (actionId === 'initial_diet') return generatedDietFormData(result.generatedPlan, profile.id)
  if (actionId === 'initial_workout') return generatedWorkoutFormData(result.generatedPlan, profile.id)
  if (actionId === 'initial_cardio') return generatedCardioFormData(result.generatedPlan, profile.id)
  return generatedSupplementFormData(result.generatedPlan, profile.id)
}

/** Fresh diet + workout + cardio + supplements (ignores current draft). */
export async function generateRemadeCompletePlan(input: {
  admin: SupabaseClient
  profile: OnboardingProfile
  coachInstruction?: string | null
}): Promise<PlanFormData> {
  const coachNote = buildRemakeCoachNote(input.coachInstruction)
  const clientJourney = await loadClientJourneySnapshot(input.admin, {
    clientId: input.profile.id,
    profile: input.profile,
    currentCheckin: null,
  })

  const diet = await generateRemakeSection(input.profile, 'initial_diet', coachNote, clientJourney)
  let merged: PlanFormData = {
    ...diet,
    client_id: input.profile.id,
    title: diet.title || 'Coaching Plan (Draft)',
  }

  const workout = await generateRemakeSection(input.profile, 'initial_workout', coachNote, clientJourney)
  merged = mergePlanForms(merged, {
    workout_plan: workout.workout_plan,
    coach_notes: [merged.coach_notes, workout.coach_notes].filter(Boolean).join('\n\n'),
  })

  try {
    const cardio = await generateRemakeSection(input.profile, 'initial_cardio', coachNote, clientJourney)
    if (cardio.cardio_plan?.trim()) {
      merged = mergePlanForms(merged, { cardio_plan: cardio.cardio_plan })
    }
  } catch (err) {
    console.warn('[remake-plan] cardio skipped', err)
  }

  try {
    const supplements = await generateRemakeSection(
      input.profile,
      'initial_supplements',
      coachNote,
      clientJourney
    )
    if (supplements.supplement_plan?.trim()) {
      merged = mergePlanForms(merged, { supplement_plan: supplements.supplement_plan })
    }
  } catch (err) {
    console.warn('[remake-plan] supplements skipped', err)
  }

  return merged
}
