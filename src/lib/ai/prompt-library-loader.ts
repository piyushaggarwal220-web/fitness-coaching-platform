import { createAdminClient } from '@/lib/supabase/admin'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import type { PromptLibraryCategory } from '@/types/database'

/** Coach AI action → Prompt Library category (published prompt source). */
export const COACH_ACTION_PROMPT_CATEGORY: Record<CoachAiActionId, PromptLibraryCategory> = {
  initial_diet: 'initial_diet',
  initial_workout: 'initial_workout',
  review_update_diet: 'weekly_diet_update',
  review_update_workout: 'weekly_workout_update',
  review_analyze_checkin: 'mid_week_analysis',
  review_coach_message: 'coach_message',
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
  actionId: CoachAiActionId
): Promise<LoadedLibraryPrompts | null> {
  const category = COACH_ACTION_PROMPT_CATEGORY[actionId]
  const action = await getPublishedPromptByCategory(category)
  if (!action) return null

  const system = await getPublishedPromptByCategory('system_prompt')
  return { action, system }
}

export function formatLibraryPromptVersion(prompt: PublishedLibraryPrompt): string {
  return `${prompt.slug}@v${prompt.version}`
}
