import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PromptLibrary,
  PromptLibraryCategory,
  PromptLibraryFormData,
  PromptLibraryListItem,
  PromptLibraryStats,
  PromptLibraryVersion,
  PromptLibraryWithVersions,
  Profile,
} from '@/types/database'

export const PROMPT_CATEGORIES: { value: PromptLibraryCategory; label: string }[] = [
  { value: 'system_prompt', label: 'System Prompt' },
  { value: 'initial_diet', label: 'Initial Diet' },
  { value: 'initial_workout', label: 'Initial Workout' },
  { value: 'weekly_diet_update', label: 'Weekly Diet Update' },
  { value: 'weekly_workout_update', label: 'Weekly Workout Update' },
  { value: 'mid_week_analysis', label: 'Mid-week Analysis' },
  { value: 'coach_message', label: 'Coach Message' },
  { value: 'future_prompts', label: 'Future Prompts' },
]

export function formatPromptCategory(category: PromptLibraryCategory): string {
  return PROMPT_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function slugifyPromptName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function validatePromptForm(data: PromptLibraryFormData): string | null {
  if (!data.name.trim()) return 'Name is required.'
  if (!data.slug.trim()) return 'Slug is required.'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug.trim())) {
    return 'Slug must use lowercase letters, numbers, and hyphens only.'
  }
  if (!data.prompt_body.trim()) return 'Prompt body is required.'
  return null
}

function deriveListStatus(
  prompt: PromptLibrary,
  draft: PromptLibraryVersion | null,
  published: PromptLibraryVersion | null
): PromptLibraryListItem['list_status'] {
  if (prompt.archived_at) return 'archived'
  if (draft) return 'draft'
  if (published) return 'published'
  return 'draft'
}

export async function getPromptLibraryStats(
  supabase: SupabaseClient
): Promise<PromptLibraryStats> {
  const { data: prompts } = await supabase
    .from('prompt_library')
    .select('id, updated_at, archived_at')

  const { data: versions } = await supabase
    .from('prompt_library_versions')
    .select('prompt_id, status, updated_at')

  const promptRows = (prompts ?? []) as Pick<PromptLibrary, 'id' | 'updated_at' | 'archived_at'>[]
  const versionRows = (versions ?? []) as Pick<PromptLibraryVersion, 'prompt_id' | 'status' | 'updated_at'>[]

  const activePrompts = promptRows.filter((p) => !p.archived_at)
  const draftPromptIds = new Set(
    versionRows.filter((v) => v.status === 'draft').map((v) => v.prompt_id)
  )
  const publishedPromptIds = new Set(
    versionRows.filter((v) => v.status === 'published').map((v) => v.prompt_id)
  )

  const lastUpdated = [...promptRows, ...versionRows.map((v) => ({ updated_at: v.updated_at }))]
    .map((r) => r.updated_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

  return {
    total: activePrompts.length,
    drafts: activePrompts.filter((p) => draftPromptIds.has(p.id)).length,
    published: activePrompts.filter((p) => publishedPromptIds.has(p.id)).length,
    lastUpdated,
  }
}

export async function listPromptLibrary(
  supabase: SupabaseClient
): Promise<{ data: PromptLibraryListItem[]; error: string | null }> {
  const { data: prompts, error } = await supabase
    .from('prompt_library')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  if (!prompts?.length) return { data: [], error: null }

  const ids = prompts.map((p) => p.id)
  const { data: versions, error: versionError } = await supabase
    .from('prompt_library_versions')
    .select('*')
    .in('prompt_id', ids)
    .order('version', { ascending: false })

  if (versionError) return { data: [], error: versionError.message }

  const versionRows = (versions ?? []) as PromptLibraryVersion[]
  const byPrompt = new Map<string, PromptLibraryVersion[]>()
  for (const v of versionRows) {
    const list = byPrompt.get(v.prompt_id) ?? []
    list.push(v)
    byPrompt.set(v.prompt_id, list)
  }

  const items: PromptLibraryListItem[] = (prompts as PromptLibrary[]).map((prompt) => {
    const promptVersions = byPrompt.get(prompt.id) ?? []
    const draft = promptVersions.find((v) => v.status === 'draft') ?? null
    const published =
      promptVersions
        .filter((v) => v.status === 'published')
        .sort((a, b) => b.version - a.version)[0] ?? null
    const currentVersion = draft?.version ?? published?.version ?? null
    const lastVersionUpdated =
      promptVersions
        .map((v) => v.updated_at)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null

    return {
      ...prompt,
      current_version: currentVersion,
      list_status: deriveListStatus(prompt, draft, published),
      last_version_updated: lastVersionUpdated,
      draft_version: draft,
      published_version: published,
    }
  })

  return { data: items, error: null }
}

export async function getPromptWithVersions(
  supabase: SupabaseClient,
  promptId: string
): Promise<{ data: PromptLibraryWithVersions | null; error: string | null }> {
  const { data: prompt, error } = await supabase
    .from('prompt_library')
    .select('*')
    .eq('id', promptId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!prompt) return { data: null, error: 'Prompt not found.' }

  const { data: versions, error: versionError } = await supabase
    .from('prompt_library_versions')
    .select('*')
    .eq('prompt_id', promptId)
    .order('version', { ascending: false })

  if (versionError) return { data: null, error: versionError.message }

  const versionRows = (versions ?? []) as PromptLibraryVersion[]
  const draft = versionRows.find((v) => v.status === 'draft') ?? null
  const published =
    versionRows.filter((v) => v.status === 'published').sort((a, b) => b.version - a.version)[0] ??
    null

  return {
    data: {
      ...(prompt as PromptLibrary),
      versions: versionRows,
      draft_version: draft,
      published_version: published,
    },
    error: null,
  }
}

export async function createPromptLibraryEntry(
  supabase: SupabaseClient,
  adminId: string,
  form: PromptLibraryFormData
): Promise<{ data: PromptLibraryWithVersions | null; error: string | null }> {
  const validation = validatePromptForm(form)
  if (validation) return { data: null, error: validation }

  const now = new Date().toISOString()
  const slug = form.slug.trim()

  const { data: prompt, error } = await supabase
    .from('prompt_library')
    .insert({
      slug,
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      created_by: adminId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !prompt) {
    return { data: null, error: error?.message ?? 'Failed to create prompt.' }
  }

  const { data: version, error: versionError } = await supabase
    .from('prompt_library_versions')
    .insert({
      prompt_id: prompt.id,
      version: 1,
      status: 'draft',
      prompt_body: form.prompt_body.trim(),
      description: form.description.trim() || null,
      created_by: adminId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (versionError || !version) {
    await supabase.from('prompt_library').delete().eq('id', prompt.id)
    return { data: null, error: versionError?.message ?? 'Failed to create draft version.' }
  }

  return getPromptWithVersions(supabase, prompt.id)
}

export async function updatePromptDraft(
  supabase: SupabaseClient,
  promptId: string,
  input: { prompt_body: string; description?: string; name?: string; category?: PromptLibraryCategory }
): Promise<{ error: string | null }> {
  const { data: prompt } = await getPromptWithVersions(supabase, promptId)
  if (!prompt) return { error: 'Prompt not found.' }
  if (prompt.archived_at) return { error: 'Archived prompts cannot be edited.' }
  if (!prompt.draft_version) return { error: 'No draft exists. Create a draft first.' }

  const now = new Date().toISOString()
  const body = input.prompt_body.trim()
  if (!body) return { error: 'Prompt body cannot be empty.' }

  const { error: versionError } = await supabase
    .from('prompt_library_versions')
    .update({
      prompt_body: body,
      description: input.description?.trim() || prompt.draft_version.description,
      updated_at: now,
    })
    .eq('id', prompt.draft_version.id)
    .eq('status', 'draft')

  if (versionError) return { error: versionError.message }

  const promptUpdate: Partial<PromptLibrary> = { updated_at: now }
  if (input.name?.trim()) promptUpdate.name = input.name.trim()
  if (input.category) promptUpdate.category = input.category
  if (input.description !== undefined) promptUpdate.description = input.description.trim() || null

  const { error: promptError } = await supabase
    .from('prompt_library')
    .update(promptUpdate)
    .eq('id', promptId)

  return { error: promptError?.message ?? null }
}

async function nextVersionNumber(
  supabase: SupabaseClient,
  promptId: string
): Promise<number> {
  const { data } = await supabase
    .from('prompt_library_versions')
    .select('version')
    .eq('prompt_id', promptId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return ((data as { version: number } | null)?.version ?? 0) + 1
}

export async function createPromptDraft(
  supabase: SupabaseClient,
  adminId: string,
  promptId: string,
  sourceVersionId?: string
): Promise<{ error: string | null }> {
  const { data: prompt } = await getPromptWithVersions(supabase, promptId)
  if (!prompt) return { error: 'Prompt not found.' }
  if (prompt.archived_at) return { error: 'Archived prompts cannot be edited.' }
  if (prompt.draft_version) return { error: 'A draft already exists.' }

  let source = prompt.published_version
  if (sourceVersionId) {
    source = prompt.versions.find((v) => v.id === sourceVersionId) ?? source
  }
  if (!source) {
    return { error: 'Publish or restore a version before creating a draft.' }
  }

  const now = new Date().toISOString()
  const nextVersion = await nextVersionNumber(supabase, promptId)

  const { error } = await supabase.from('prompt_library_versions').insert({
    prompt_id: promptId,
    version: nextVersion,
    status: 'draft',
    prompt_body: source.prompt_body,
    description: source.description,
    created_by: adminId,
    created_at: now,
    updated_at: now,
  })

  if (error) return { error: error.message }

  await supabase.from('prompt_library').update({ updated_at: now }).eq('id', promptId)
  return { error: null }
}

export async function publishPromptDraft(
  supabase: SupabaseClient,
  promptId: string
): Promise<{ error: string | null }> {
  const { data: prompt } = await getPromptWithVersions(supabase, promptId)
  if (!prompt) return { error: 'Prompt not found.' }
  if (prompt.archived_at) return { error: 'Archived prompts cannot be published.' }
  if (!prompt.draft_version) return { error: 'No draft to publish.' }
  if (!prompt.draft_version.prompt_body.trim()) return { error: 'Draft prompt body is empty.' }

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('prompt_library_versions')
    .update({
      status: 'published',
      published_at: now,
      updated_at: now,
    })
    .eq('id', prompt.draft_version.id)
    .eq('status', 'draft')

  if (error) return { error: error.message }

  await supabase.from('prompt_library').update({ updated_at: now }).eq('id', promptId)
  return { error: null }
}

export async function archivePromptLibrary(
  supabase: SupabaseClient,
  promptId: string
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()
  const { data: prompt } = await getPromptWithVersions(supabase, promptId)
  if (!prompt) return { error: 'Prompt not found.' }

  if (prompt.draft_version) {
    await supabase
      .from('prompt_library_versions')
      .update({ status: 'archived', updated_at: now })
      .eq('id', prompt.draft_version.id)
  }

  const { error } = await supabase
    .from('prompt_library')
    .update({ archived_at: now, updated_at: now })
    .eq('id', promptId)

  return { error: error?.message ?? null }
}

export async function restorePromptVersion(
  supabase: SupabaseClient,
  adminId: string,
  promptId: string,
  versionId: string
): Promise<{ error: string | null }> {
  const { data: prompt } = await getPromptWithVersions(supabase, promptId)
  if (!prompt) return { error: 'Prompt not found.' }
  if (prompt.archived_at) return { error: 'Unarchive the prompt before restoring a version.' }

  const source = prompt.versions.find((v) => v.id === versionId)
  if (!source) return { error: 'Version not found.' }

  const now = new Date().toISOString()

  if (prompt.draft_version) {
    const { error } = await supabase
      .from('prompt_library_versions')
      .update({
        prompt_body: source.prompt_body,
        description: source.description,
        updated_at: now,
      })
      .eq('id', prompt.draft_version.id)

    if (error) return { error: error.message }
  } else {
    const nextVersion = await nextVersionNumber(supabase, promptId)
    const { error } = await supabase.from('prompt_library_versions').insert({
      prompt_id: promptId,
      version: nextVersion,
      status: 'draft',
      prompt_body: source.prompt_body,
      description: source.description,
      created_by: adminId,
      created_at: now,
      updated_at: now,
    })
    if (error) return { error: error.message }
  }

  await supabase.from('prompt_library').update({ updated_at: now }).eq('id', promptId)
  return { error: null }
}

export type PromptPreviewResult = {
  preview: string
  characterCount: number
  estimatedTokens: number
}

export function renderPromptPreview(
  promptBody: string,
  profile: Pick<Profile, 'name' | 'age' | 'gender' | 'fitness_goal' | 'weight' | 'height'> | null
): PromptPreviewResult {
  const replacements: Record<string, string> = {
    '{{client.name}}': profile?.name?.trim() || 'Sample Client',
    '{{client.age}}': profile?.age != null ? String(profile.age) : '30',
    '{{client.gender}}': profile?.gender?.trim() || 'Not specified',
    '{{client.goal}}': profile?.fitness_goal?.trim() || 'General fitness',
    '{{client.weight}}': profile?.weight != null ? String(profile.weight) : '70',
    '{{client.height}}': profile?.height != null ? String(profile.height) : '170',
  }

  let preview = promptBody
  for (const [token, value] of Object.entries(replacements)) {
    preview = preview.split(token).join(value)
  }

  const characterCount = preview.length
  const estimatedTokens = Math.ceil(characterCount / 4)

  return { preview, characterCount, estimatedTokens }
}

export function diffPromptLines(left: string, right: string): {
  leftLines: { text: string; changed: boolean }[]
  rightLines: { text: string; changed: boolean }[]
} {
  const leftParts = left.split('\n')
  const rightParts = right.split('\n')
  const max = Math.max(leftParts.length, rightParts.length)

  const leftLines: { text: string; changed: boolean }[] = []
  const rightLines: { text: string; changed: boolean }[] = []

  for (let i = 0; i < max; i++) {
    const l = leftParts[i] ?? ''
    const r = rightParts[i] ?? ''
    const changed = l !== r
    leftLines.push({ text: l, changed })
    rightLines.push({ text: r, changed })
  }

  return { leftLines, rightLines }
}
