import { createAdminClient } from '@/lib/supabase/admin'
import type {
  AiKnowledge,
  AiKnowledgeCategory,
  CreateAiKnowledgeInput,
  UpdateAiKnowledgeInput,
} from '@/types/database'

/** All valid knowledge categories — mirrors the DB CHECK constraint. */
export const KNOWLEDGE_CATEGORIES: readonly AiKnowledgeCategory[] = [
  'fat_loss',
  'muscle_gain',
  'recomposition',
  'strength',
  'nutrition',
  'cardio',
  'supplements',
  'recovery',
  'checkins',
  'injuries',
  'female',
  'beginner',
  'intermediate',
  'advanced',
] as const

const CATEGORY_SET = new Set<string>(KNOWLEDGE_CATEGORIES)

export type KnowledgeResult<T> = {
  data: T
  error: string | null
}

function isValidCategory(category: string): category is AiKnowledgeCategory {
  return CATEGORY_SET.has(category)
}

function validateCreateInput(input: CreateAiKnowledgeInput): string | null {
  if (!input.title?.trim()) return 'Title is required.'
  if (!input.content?.trim()) return 'Content is required.'
  if (!isValidCategory(input.category)) return `Invalid category: ${input.category}`
  if (input.version !== undefined && input.version < 1) return 'Version must be at least 1.'
  return null
}

function validateUpdateInput(input: UpdateAiKnowledgeInput): string | null {
  if (input.title !== undefined && !input.title.trim()) return 'Title cannot be empty.'
  if (input.content !== undefined && !input.content.trim()) return 'Content cannot be empty.'
  if (input.category !== undefined && !isValidCategory(input.category)) {
    return `Invalid category: ${input.category}`
  }
  if (input.version !== undefined && input.version < 1) return 'Version must be at least 1.'
  return null
}

/**
 * Fetch active knowledge entries for a single category.
 * Returns newest version first.
 */
export async function getKnowledge(
  category: AiKnowledgeCategory
): Promise<KnowledgeResult<AiKnowledge[]>> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_knowledge')
    .select('*')
    .eq('category', category)
    .eq('active', true)
    .order('version', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as AiKnowledge[], error: null }
}

/**
 * Fetch all active knowledge entries across every category.
 * Ordered by category, then version (newest first).
 */
export async function getAllKnowledge(): Promise<KnowledgeResult<AiKnowledge[]>> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_knowledge')
    .select('*')
    .eq('active', true)
    .order('category', { ascending: true })
    .order('version', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as AiKnowledge[], error: null }
}

/**
 * Insert a new knowledge entry.
 * Defaults: version = 1, active = true.
 */
export async function createKnowledge(
  input: CreateAiKnowledgeInput
): Promise<KnowledgeResult<AiKnowledge | null>> {
  const validationError = validateCreateInput(input)
  if (validationError) return { data: null, error: validationError }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('ai_knowledge')
    .insert({
      title: input.title.trim(),
      category: input.category,
      content: input.content.trim(),
      version: input.version ?? 1,
      active: input.active ?? true,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as AiKnowledge, error: null }
}

/**
 * Update an existing knowledge entry by id.
 */
export async function updateKnowledge(
  id: string,
  input: UpdateAiKnowledgeInput
): Promise<KnowledgeResult<AiKnowledge | null>> {
  if (!id?.trim()) return { data: null, error: 'Knowledge id is required.' }

  const validationError = validateUpdateInput(input)
  if (validationError) return { data: null, error: validationError }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.title !== undefined) payload.title = input.title.trim()
  if (input.category !== undefined) payload.category = input.category
  if (input.content !== undefined) payload.content = input.content.trim()
  if (input.version !== undefined) payload.version = input.version
  if (input.active !== undefined) payload.active = input.active

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_knowledge')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as AiKnowledge, error: null }
}
