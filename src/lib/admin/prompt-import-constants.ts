import type { PromptLibraryCategory } from '@/types/database'

/** Core production workflow prompts (gym + diet). */
export const CORE_PRODUCTION_PROMPT_CATEGORIES = [
  'initial_diet',
  'initial_workout',
  'weekly_diet_update',
  'weekly_workout_update',
] as const satisfies readonly PromptLibraryCategory[]

/** Home workout prompts — imported when production files contain content. */
export const HOME_WORKOUT_PROMPT_CATEGORIES = [
  'initial_workout_home',
  'weekly_workout_update_home',
] as const satisfies readonly PromptLibraryCategory[]

/** All categories supported by the production import utility. */
export const IMPORTABLE_PROMPT_CATEGORIES = [
  ...CORE_PRODUCTION_PROMPT_CATEGORIES,
  ...HOME_WORKOUT_PROMPT_CATEGORIES,
] as const satisfies readonly PromptLibraryCategory[]

export type ImportablePromptCategory = (typeof IMPORTABLE_PROMPT_CATEGORIES)[number]

export function isImportablePromptCategory(value: string): value is ImportablePromptCategory {
  return (IMPORTABLE_PROMPT_CATEGORIES as readonly string[]).includes(value)
}
