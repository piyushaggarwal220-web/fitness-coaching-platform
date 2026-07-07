import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatPromptCategory, getPromptWithVersions } from '@/lib/admin/prompt-library'
import {
  CORE_PRODUCTION_PROMPT_CATEGORIES,
  IMPORTABLE_PROMPT_CATEGORIES,
  isImportablePromptCategory,
  type ImportablePromptCategory,
} from '@/lib/admin/prompt-import-constants'
import type { PromptLibraryWithVersions } from '@/types/database'

export { IMPORTABLE_PROMPT_CATEGORIES, CORE_PRODUCTION_PROMPT_CATEGORIES, HOME_WORKOUT_PROMPT_CATEGORIES, isImportablePromptCategory } from '@/lib/admin/prompt-import-constants'
export type { ImportablePromptCategory }

export type PromptImportInput = {
  slug: string
  category: ImportablePromptCategory
  /** Stored verbatim — whitespace is never altered. */
  prompt_body: string
  name?: string
  description?: string
}

export type PromptImportResult = {
  slug: string
  category: ImportablePromptCategory
  promptId: string
  version: number
  status: 'created' | 'skipped' | 'republished'
  reason?: string
}

export type PromptImportBatchResult = {
  imported: PromptImportResult[]
  errors: { slug: string; category: string; error: string }[]
  promptCount: number
  publishedPromptCount: number
}

export type ProductionPromptManifestEntry = {
  slug: string
  category: ImportablePromptCategory
  /** Relative path from manifest directory, or inline body via prompt_body */
  file?: string
  prompt_body?: string
  name?: string
  description?: string
}

export type ProductionPromptManifest = {
  prompts: ProductionPromptManifestEntry[]
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function validatePromptImportInput(input: PromptImportInput): string | null {
  const slug = input.slug.trim()
  if (!slug) return 'Slug is required.'
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug must use lowercase letters, numbers, and hyphens only.'
  }
  if (!isImportablePromptCategory(input.category)) {
    return `Unsupported category "${input.category}".`
  }
  if (input.prompt_body.length === 0) return 'Prompt body is required.'
  return null
}

function defaultNameForCategory(category: ImportablePromptCategory): string {
  return formatPromptCategory(category)
}

async function findActivePromptByCategory(
  supabase: SupabaseClient,
  category: ImportablePromptCategory
) {
  const { data: prompts, error } = await supabase
    .from('prompt_library')
    .select('id, slug, category, archived_at')
    .eq('category', category)
    .is('archived_at', null)

  if (error) {
    if (error.message.includes('invalid input value for enum prompt_library_category')) {
      return null
    }
    throw new Error(error.message)
  }
  if (!prompts?.length) return null

  for (const prompt of prompts) {
    const loaded = await getPromptWithVersions(supabase, prompt.id)
    if (loaded.data?.published_version) {
      return loaded.data
    }
  }

  return null
}

async function findPromptBySlug(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from('prompt_library')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.id) return null
  return getPromptWithVersions(supabase, data.id)
}

async function nextPromptVersion(supabase: SupabaseClient, promptId: string): Promise<number> {
  const { data } = await supabase
    .from('prompt_library_versions')
    .select('version')
    .eq('prompt_id', promptId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return ((data as { version: number } | null)?.version ?? 0) + 1
}

async function republishPromptBody(
  supabase: SupabaseClient,
  adminId: string | null,
  prompt: PromptLibraryWithVersions,
  promptBody: string,
  category: ImportablePromptCategory,
  slug: string
): Promise<{ data: PromptImportResult | null; error: string | null }> {
  const now = new Date().toISOString()
  const nextVersion = await nextPromptVersion(supabase, prompt.id)

  await supabase
    .from('prompt_library_versions')
    .update({ status: 'archived', updated_at: now })
    .eq('prompt_id', prompt.id)
    .eq('status', 'published')

  const { error: versionError } = await supabase.from('prompt_library_versions').insert({
    prompt_id: prompt.id,
    version: nextVersion,
    status: 'published',
    prompt_body: promptBody,
    description: prompt.description,
    created_by: adminId,
    created_at: now,
    updated_at: now,
    published_at: now,
  })

  if (versionError) {
    return { data: null, error: versionError.message }
  }

  await supabase.from('prompt_library').update({ updated_at: now }).eq('id', prompt.id)

  return {
    data: {
      slug,
      category,
      promptId: prompt.id,
      version: nextVersion,
      status: 'republished',
    },
    error: null,
  }
}

/**
 * Import one prompt as version 1 with status=published.
 * Preserves prompt_body whitespace exactly.
 */
export async function importPublishedPrompt(
  supabase: SupabaseClient,
  adminId: string | null,
  input: PromptImportInput,
  options: { skipIfCategoryPublished?: boolean; republishIfChanged?: boolean } = {}
): Promise<{ data: PromptImportResult | null; error: string | null }> {
  const validation = validatePromptImportInput(input)
  if (validation) return { data: null, error: validation }

  const slug = input.slug.trim()
  const skipIfCategoryPublished = options.skipIfCategoryPublished ?? true
  const republishIfChanged = options.republishIfChanged ?? false

  if (skipIfCategoryPublished) {
    const existingForCategory = await findActivePromptByCategory(supabase, input.category)
    if (existingForCategory?.published_version) {
      if (
        republishIfChanged &&
        existingForCategory.published_version.prompt_body !== input.prompt_body
      ) {
        return republishPromptBody(
          supabase,
          adminId,
          existingForCategory,
          input.prompt_body,
          input.category,
          existingForCategory.slug
        )
      }
      if (existingForCategory.published_version.prompt_body === input.prompt_body) {
        return {
          data: {
            slug: existingForCategory.slug,
            category: input.category,
            promptId: existingForCategory.id,
            version: existingForCategory.published_version.version,
            status: 'skipped',
            reason: 'Published prompt unchanged for this category.',
          },
          error: null,
        }
      }
      return {
        data: {
          slug: existingForCategory.slug,
          category: input.category,
          promptId: existingForCategory.id,
          version: existingForCategory.published_version.version,
          status: 'skipped',
          reason: 'Published prompt already exists for this category.',
        },
        error: null,
      }
    }
  }

  const existingBySlug = await findPromptBySlug(supabase, slug)
  if (existingBySlug?.data) {
    const prompt = existingBySlug.data
    if (prompt.archived_at) {
      return {
        data: null,
        error: `Slug "${slug}" is archived. Restore it in Admin before importing.`,
      }
    }
    if (prompt.published_version) {
      return {
        data: {
          slug,
          category: input.category,
          promptId: prompt.id,
          version: prompt.published_version.version,
          status: 'skipped',
          reason: 'Published prompt already exists for this slug.',
        },
        error: null,
      }
    }
    if (prompt.versions.length > 0) {
      return {
        data: null,
        error: `Slug "${slug}" already exists with non-published versions. Resolve in Admin UI.`,
      }
    }
  }

  const now = new Date().toISOString()
  const name = input.name?.trim() || defaultNameForCategory(input.category)
  const description = input.description?.trim() || null

  const { data: prompt, error: promptError } = await supabase
    .from('prompt_library')
    .insert({
      slug,
      name,
      category: input.category,
      description,
      created_by: adminId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (promptError || !prompt) {
    return { data: null, error: promptError?.message ?? 'Failed to create prompt.' }
  }

  const { data: version, error: versionError } = await supabase
    .from('prompt_library_versions')
    .insert({
      prompt_id: prompt.id,
      version: 1,
      status: 'published',
      prompt_body: input.prompt_body,
      description,
      created_by: adminId,
      created_at: now,
      updated_at: now,
      published_at: now,
    })
    .select()
    .single()

  if (versionError || !version) {
    await supabase.from('prompt_library').delete().eq('id', prompt.id)
    return { data: null, error: versionError?.message ?? 'Failed to create published version.' }
  }

  return {
    data: {
      slug,
      category: input.category,
      promptId: prompt.id,
      version: 1,
      status: 'created',
    },
    error: null,
  }
}

export async function importPublishedPrompts(
  supabase: SupabaseClient,
  adminId: string | null,
  inputs: PromptImportInput[],
  options: { skipIfCategoryPublished?: boolean; republishIfChanged?: boolean } = {}
): Promise<PromptImportBatchResult> {
  const imported: PromptImportResult[] = []
  const errors: PromptImportBatchResult['errors'] = []

  for (const input of inputs) {
    const result = await importPublishedPrompt(supabase, adminId, input, options)
    if (result.error || !result.data) {
      errors.push({
        slug: input.slug.trim(),
        category: input.category,
        error: result.error ?? 'Import failed.',
      })
      continue
    }
    imported.push(result.data)
  }

  const counts = await countPromptLibraryPrompts(supabase)
  return {
    imported,
    errors,
    promptCount: counts.promptCount,
    publishedPromptCount: counts.publishedPromptCount,
  }
}

export async function countPromptLibraryPrompts(supabase: SupabaseClient): Promise<{
  promptCount: number
  publishedPromptCount: number
}> {
  const { data: prompts } = await supabase
    .from('prompt_library')
    .select('id, archived_at')
    .is('archived_at', null)

  const activePromptIds = (prompts ?? []).map((p) => p.id)
  if (activePromptIds.length === 0) {
    return { promptCount: 0, publishedPromptCount: 0 }
  }

  const { data: versions } = await supabase
    .from('prompt_library_versions')
    .select('prompt_id, status')
    .in('prompt_id', activePromptIds)
    .eq('status', 'published')

  const publishedPromptIds = new Set((versions ?? []).map((v) => v.prompt_id))
  return {
    promptCount: activePromptIds.length,
    publishedPromptCount: publishedPromptIds.size,
  }
}

export type PromptImportVerification = {
  ok: boolean
  missingCategories: ImportablePromptCategory[]
  promptCount: number
  publishedPromptCount: number
  categories: Record<ImportablePromptCategory, { slug: string; version: number } | null>
}

/** Verify importable categories have an active published prompt. */
export async function verifyImportedPrompts(
  supabase: SupabaseClient,
  options?: { categories?: readonly ImportablePromptCategory[] }
): Promise<PromptImportVerification> {
  const categoriesToCheck = options?.categories ?? IMPORTABLE_PROMPT_CATEGORIES
  const categories = {} as PromptImportVerification['categories']
  const missingCategories: ImportablePromptCategory[] = []

  for (const category of IMPORTABLE_PROMPT_CATEGORIES) {
    categories[category] = null
  }

  for (const category of categoriesToCheck) {
    const prompt = await findActivePromptByCategory(supabase, category)
    if (prompt?.published_version) {
      categories[category] = {
        slug: prompt.slug,
        version: prompt.published_version.version,
      }
    } else {
      categories[category] = null
      missingCategories.push(category)
    }
  }

  const counts = await countPromptLibraryPrompts(supabase)
  return {
    ok: missingCategories.length === 0,
    missingCategories,
    promptCount: counts.promptCount,
    publishedPromptCount: counts.publishedPromptCount,
    categories,
  }
}

export async function loadProductionPromptManifest(
  manifestPath: string
): Promise<{ inputs: PromptImportInput[]; skippedEmpty: string[]; error: string | null }> {
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read manifest.'
    return { inputs: [], skippedEmpty: [], error: message }
  }

  let manifest: ProductionPromptManifest
  try {
    manifest = JSON.parse(raw) as ProductionPromptManifest
  } catch {
    return { inputs: [], skippedEmpty: [], error: 'Manifest is not valid JSON.' }
  }

  if (!Array.isArray(manifest.prompts) || manifest.prompts.length === 0) {
    return { inputs: [], skippedEmpty: [], error: 'Manifest must include a non-empty prompts array.' }
  }

  const baseDir = path.dirname(manifestPath)
  const inputs: PromptImportInput[] = []
  const skippedEmpty: string[] = []

  for (const entry of manifest.prompts) {
    if (!entry.slug?.trim()) {
      return { inputs: [], skippedEmpty: [], error: 'Each manifest entry requires a slug.' }
    }
    if (!isImportablePromptCategory(entry.category)) {
      return { inputs: [], skippedEmpty: [], error: `Unsupported category "${entry.category}" in manifest.` }
    }

    let promptBody: string
    if (typeof entry.prompt_body === 'string') {
      promptBody = entry.prompt_body
    } else if (entry.file) {
      const filePath = path.resolve(baseDir, entry.file)
      try {
        promptBody = await readFile(filePath, 'utf8')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read prompt file.'
        return { inputs: [], skippedEmpty: [], error: `Could not read ${entry.file}: ${message}` }
      }
    } else {
      return { inputs: [], skippedEmpty: [], error: `Entry "${entry.slug}" requires file or prompt_body.` }
    }

    if (!promptBody.trim()) {
      skippedEmpty.push(entry.slug.trim())
      continue
    }

    inputs.push({
      slug: entry.slug.trim(),
      category: entry.category,
      prompt_body: promptBody,
      name: entry.name,
      description: entry.description,
    })
  }

  return { inputs, skippedEmpty, error: null }
}

export async function importProductionPromptManifest(
  supabase: SupabaseClient,
  adminId: string | null,
  manifestPath: string,
  options: { skipIfCategoryPublished?: boolean; republishIfChanged?: boolean } = {}
): Promise<
  PromptImportBatchResult & { verification: PromptImportVerification; skippedEmpty: string[] }
> {
  const loaded = await loadProductionPromptManifest(manifestPath)
  if (loaded.error) {
    const counts = await countPromptLibraryPrompts(supabase)
    return {
      imported: [],
      errors: [{ slug: 'manifest', category: 'all', error: loaded.error }],
      promptCount: counts.promptCount,
      publishedPromptCount: counts.publishedPromptCount,
      verification: await verifyImportedPrompts(supabase),
      skippedEmpty: [],
    }
  }

  const batch = await importPublishedPrompts(supabase, adminId, loaded.inputs, options)
  const verification = await verifyImportedPrompts(supabase)
  return { ...batch, verification, skippedEmpty: loaded.skippedEmpty }
}

export function summarizeImportBatch(result: PromptImportBatchResult): string {
  const created = result.imported.filter((r) => r.status === 'created').length
  const republished = result.imported.filter((r) => r.status === 'republished').length
  const skipped = result.imported.filter((r) => r.status === 'skipped').length
  return `created=${created}, republished=${republished}, skipped=${skipped}, errors=${result.errors.length}, prompts=${result.promptCount}, published=${result.publishedPromptCount}`
}

export type { PromptLibraryWithVersions }
