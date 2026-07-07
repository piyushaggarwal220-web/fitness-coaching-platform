import type { PromptLibraryCategory } from '@/types/database'

/** Categories supported by the production import utility. */
export const IMPORTABLE_PROMPT_CATEGORIES = [
  'system_prompt',
  'initial_diet',
  'initial_workout',
  'weekly_diet_update',
  'weekly_workout_update',
  'mid_week_analysis',
  'coach_message',
] as const satisfies readonly PromptLibraryCategory[]

export type ImportablePromptCategory = (typeof IMPORTABLE_PROMPT_CATEGORIES)[number]

export function isImportablePromptCategory(value: string): value is ImportablePromptCategory {
  return (IMPORTABLE_PROMPT_CATEGORIES as readonly string[]).includes(value)
}
