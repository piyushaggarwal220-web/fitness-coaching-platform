import { editPlanSection } from '@/lib/ai/edit-plan-section'
import type { OnboardingProfile, PlanFormData } from '@/types/database'

/** Rewrite diet + workout from the coach instruction, using the current draft as background. */
export async function regeneratePlanWithCoachInstruction(input: {
  profile: OnboardingProfile
  draft: Pick<PlanFormData, 'nutrition_plan' | 'workout_plan'>
  coachInstruction: string
}): Promise<Pick<PlanFormData, 'nutrition_plan' | 'workout_plan'>> {
  const instruction = input.coachInstruction.trim()
  if (!instruction) {
    throw new Error('Coach instruction is required.')
  }

  const shared = {
    coachInstruction: instruction,
    editSource: 'coach' as const,
    remakeFromScratch: false,
    clientId: input.profile.id,
    clientName: input.profile.name,
    profile: input.profile,
  }

  const nutrition = await editPlanSection({
    section: 'nutrition',
    currentText: input.draft.nutrition_plan ?? '',
    ...shared,
  })

  const workout = await editPlanSection({
    section: 'workout',
    currentText: input.draft.workout_plan ?? '',
    ...shared,
  })

  return {
    nutrition_plan: nutrition.revisedText,
    workout_plan: workout.revisedText,
  }
}
