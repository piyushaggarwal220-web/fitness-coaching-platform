/**
 * Import production prompts from prompts/production/manifest.json
 * Run: npx tsx --env-file=.env.local scripts/import-production-prompts.ts
 */
import path from 'node:path'
import { importProductionPromptManifest, summarizeImportBatch } from '../src/lib/admin/prompt-import'
import { createAdminClient } from '../src/lib/supabase/admin'

async function main(): Promise<void> {
  const manifestPath = path.join(process.cwd(), 'prompts', 'production', 'manifest.json')
  const admin = createAdminClient()

  console.log('=== Production Prompt Import ===')
  console.log(`Manifest: ${manifestPath}\n`)

  const result = await importProductionPromptManifest(admin, null, manifestPath, {
    skipIfCategoryPublished: true,
  })

  for (const item of result.imported) {
    console.log(
      `${item.status === 'created' ? 'CREATED' : 'SKIPPED'} ${item.category} (${item.slug}@v${item.version})${
        item.reason ? ` — ${item.reason}` : ''
      }`
    )
  }

  for (const err of result.errors) {
    console.error(`ERROR ${err.category} (${err.slug}): ${err.error}`)
  }

  console.log(`\n${summarizeImportBatch(result)}`)
  console.log(`Verification: ${result.verification.ok ? 'PASS' : 'FAIL'}`)

  if (!result.verification.ok) {
    console.error('Missing categories:', result.verification.missingCategories.join(', '))
  }

  process.exit(result.errors.length === 0 && result.verification.ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
