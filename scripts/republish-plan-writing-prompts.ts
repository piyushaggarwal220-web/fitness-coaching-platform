/**
 * Republish only the six plan-writing prompts.
 * Does not touch the system prompt or any other category.
 *
 *   npx tsx --env-file=.env.local scripts/republish-plan-writing-prompts.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { importPublishedPrompts } from '../src/lib/admin/prompt-import'
import type { ImportablePromptCategory } from '../src/lib/admin/prompt-import-constants'
import { invalidatePromptLibrary } from '../src/lib/ai/prompt-cache'
import { createAdminClient } from '../src/lib/supabase/admin'

const FILES: { category: ImportablePromptCategory; slug: string; file: string; name: string }[] = [
  { category: 'initial_diet', slug: 'initial-diet-prompt', file: 'initial-diet.prompt', name: 'Initial Diet Prompt' },
  { category: 'initial_workout', slug: 'initial-workout-prompt', file: 'initial-workout.prompt', name: 'Initial Workout — Gym' },
  { category: 'initial_workout_home', slug: 'initial-workout-home-prompt', file: 'initial-workout-home.prompt', name: 'Initial Workout — Home' },
  { category: 'weekly_diet_update', slug: 'updated-diet-prompt', file: 'updated-diet.prompt', name: 'Updated Diet Prompt' },
  { category: 'weekly_workout_update', slug: 'updated-workout-prompt', file: 'updated-workout.prompt', name: 'Updated Workout — Gym' },
  { category: 'weekly_workout_update_home', slug: 'updated-workout-home-prompt', file: 'updated-workout-home.prompt', name: 'Updated Workout — Home' },
]

async function main(): Promise<void> {
  const admin = createAdminClient()
  const inputs = FILES.map((item) => ({
    slug: item.slug,
    category: item.category,
    name: item.name,
    prompt_body: readFileSync(path.join(process.cwd(), 'prompts', 'production', item.file), 'utf8'),
  }))
  const result = await importPublishedPrompts(admin, null, inputs, {
    skipIfCategoryPublished: true,
    republishIfChanged: true,
  })
  for (const item of result.imported) {
    console.log(`${item.status.toUpperCase()} ${item.category} ${item.slug}@v${item.version}${item.reason ? ` — ${item.reason}` : ''}`)
  }
  for (const err of result.errors) console.error(`ERROR ${err.category}: ${err.error}`)
  if (result.imported.some((item) => item.status === 'republished' || item.status === 'created')) {
    await invalidatePromptLibrary()
    console.log('Invalidated local prompt cache.')
  }
  if (result.errors.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
