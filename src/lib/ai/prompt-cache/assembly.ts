import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import type { PromptContextSectionKey } from '@/lib/ai/prompt-builder'

/** Append order mirrored from prompt-builder (not exported there). */
export function resolveAppendOrderForAction(
  actionId?: CoachAiActionId
): PromptContextSectionKey[] {
  switch (actionId) {
    case 'initial_workout':
    case 'initial_cardio':
      return [
        'hardConstraints',
        'clientDetails',
        'onboarding',
        'trainingPreferences',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
    case 'review_update_diet':
    case 'review_update_supplements':
      return [
        'hardConstraints',
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
        'clientDetails',
        'onboarding',
        'trainingPreferences',
        'activeWorkout',
        'activeDiet',
        'updatedDiet',
        'checkin',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
    default:
      return [
        'hardConstraints',
        'clientDetails',
        'onboarding',
        'coachNotes',
        'knowledge',
        'complexity',
      ]
  }
}

export function defaultAssemblyOrder(actionId?: CoachAiActionId): string[] {
  const order = resolveAppendOrderForAction(actionId)
  return ['system-prompt', 'action-template', ...order.map((k) => String(k))]
}
