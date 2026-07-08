import { createAdminClient } from '@/lib/supabase/admin'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import {
  getPromptCategoryForAction,
} from '@/lib/ai/workout-prompt-selection'
import type { OnboardingProfile, PromptLibraryCategory } from '@/types/database'

/** Diet coach actions → static Prompt Library category. Workout actions resolve dynamically. */
export const COACH_ACTION_PROMPT_CATEGORY: Record<
  Exclude<CoachAiActionId, 'initial_workout' | 'review_update_workout'>,
  PromptLibraryCategory
> = {
  initial_diet: 'initial_diet',
  review_update_diet: 'weekly_diet_update',
}

export type PublishedLibraryPrompt = {
  slug: string
  name: string
  category: PromptLibraryCategory
  version: number
  promptBody: string
}

export type LoadedLibraryPrompts = {
  action: PublishedLibraryPrompt
  system: PublishedLibraryPrompt | null
  /** Category selected from onboarding (before any gym fallback). */
  resolvedCategory: PromptLibraryCategory
}

export async function getPublishedPromptByCategory(
  category: PromptLibraryCategory
): Promise<PublishedLibraryPrompt | null> {
  const admin = createAdminClient()

  const { data: prompts, error: promptError } = await admin
    .from('prompt_library')
    .select('id, slug, name, category')
    .eq('category', category)
    .is('archived_at', null)

  if (promptError || !prompts?.length) return null

  const promptIds = prompts.map((p) => p.id)
  const { data: versions, error: versionError } = await admin
    .from('prompt_library_versions')
    .select('prompt_id, version, prompt_body, published_at')
    .in('prompt_id', promptIds)
    .eq('status', 'published')
    .order('version', { ascending: false })

  if (versionError || !versions?.length) return null

  const latest = versions[0]
  const meta = prompts.find((p) => p.id === latest.prompt_id)
  if (!meta) return null

  return {
    slug: meta.slug,
    name: meta.name,
    category: meta.category as PromptLibraryCategory,
    version: latest.version,
    promptBody: latest.prompt_body,
  }
}

export async function loadPublishedPromptsForAction(
  actionId: CoachAiActionId,
  profile?: OnboardingProfile | null
): Promise<LoadedLibraryPrompts | null> {
  const resolvedCategory = getPromptCategoryForAction(actionId, profile)
  const action = await getPublishedPromptByCategory(resolvedCategory)

  if (!action) return null

  const system = await getPublishedPromptByCategory('system_prompt')
  return { action, system, resolvedCategory }
}

export function formatLibraryPromptVersion(prompt: PublishedLibraryPrompt): string {
  return `${prompt.slug}@v${prompt.version}`
}
