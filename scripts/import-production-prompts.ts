/**
 * Import production prompts from prompts/production/manifest.json
 * Run: npx tsx --env-file=.env.local scripts/import-production-prompts.ts
 */
import path from 'node:path'
import {
  CORE_PRODUCTION_PROMPT_CATEGORIES,
  HOME_WORKOUT_PROMPT_CATEGORIES,
  importProductionPromptManifest,
  summarizeImportBatch,
  verifyImportedPrompts,
} from '../src/lib/admin/prompt-import'
import { createAdminClient } from '../src/lib/supabase/admin'

async function main(): Promise<void> {
  const manifestPath = path.join(process.cwd(), 'prompts', 'production', 'manifest.json')
  const admin = createAdminClient()

  console.log('=== Production Prompt Import ===')
  console.log(`Manifest: ${manifestPath}\n`)

  const result = await importProductionPromptManifest(admin, null, manifestPath, {
    skipIfCategoryPublished: true,
    republishIfChanged: true,
  })

  for (const item of result.imported) {
    const label =
      item.status === 'created' ? 'CREATED' : item.status === 'republished' ? 'REPUBLISHED' : 'SKIPPED'
    console.log(
      `${label} ${item.category} (${item.slug}@v${item.version})${
        item.reason ? ` — ${item.reason}` : ''
      }`
    )
  }

  for (const err of result.errors) {
    console.error(`ERROR ${err.category} (${err.slug}): ${err.error}`)
  }

  if (result.skippedEmpty.length > 0) {
    console.log(
      `\nSkipped empty placeholder files: ${result.skippedEmpty.join(', ')} (paste content and re-run import)`
    )
  }

  console.log(`\n${summarizeImportBatch(result)}`)

  const coreVerification = await verifyImportedPrompts(admin, {
    categories: CORE_PRODUCTION_PROMPT_CATEGORIES,
  })
  const homeVerification = await verifyImportedPrompts(admin, {
    categories: HOME_WORKOUT_PROMPT_CATEGORIES,
  })

  console.log(`Core verification: ${coreVerification.ok ? 'PASS' : 'FAIL'}`)
  if (!coreVerification.ok) {
    console.error('Missing core categories:', coreVerification.missingCategories.join(', '))
  }

  console.log(`Home workout verification: ${homeVerification.ok ? 'PASS' : 'FAIL'}`)
  if (!homeVerification.ok) {
    console.error('Missing home categories:', homeVerification.missingCategories.join(', '))
  }

  const allOk = result.errors.length === 0 && coreVerification.ok && homeVerification.ok
  process.exit(allOk ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
