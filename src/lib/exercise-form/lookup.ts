import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMuscleWikiExercise,
  isMuscleWikiConfigured,
  searchMuscleWiki,
  type MuscleWikiExercise,
  type MuscleWikiVideo,
} from '@/lib/exercise-form/musclewiki'
import {
  matchScore,
  normalizeExerciseQuery,
  applyExerciseAliases,
  shouldSkipExerciseForm,
} from '@/lib/exercise-form/normalize'

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_ACCEPT_SCORE = 36

export type ExerciseFormResult = {
  configured: boolean
  skipped: boolean
  found: boolean
  query: string
  name: string | null
  steps: string[]
  muscles: string[]
  videos: MuscleWikiVideo[]
  exerciseId: number | null
}

const memory = new Map<string, { expiresAt: number; value: ExerciseFormResult }>()

function emptyResult(
  query: string,
  extras: Partial<ExerciseFormResult> = {}
): ExerciseFormResult {
  return {
    configured: isMuscleWikiConfigured(),
    skipped: false,
    found: false,
    query,
    name: null,
    steps: [],
    muscles: [],
    videos: [],
    exerciseId: null,
    ...extras,
  }
}

function fromExercise(query: string, exercise: MuscleWikiExercise): ExerciseFormResult {
  return {
    configured: true,
    skipped: false,
    found: true,
    query,
    name: exercise.name,
    steps: exercise.steps.slice(0, 8),
    muscles: exercise.muscles.slice(0, 6),
    videos: exercise.videos,
    exerciseId: exercise.id,
  }
}

async function readCache(nameKey: string): Promise<ExerciseFormResult | null> {
  const mem = memory.get(nameKey)
  if (mem && mem.expiresAt > Date.now()) return mem.value
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('exercise_form_cache')
      .select('musclewiki_id, display_name, steps, muscles, videos, found, fetched_at')
      .eq('name_key', nameKey)
      .maybeSingle()
    if (error || !data) return null
    const fetchedAt = Date.parse(String(data.fetched_at))
    if (!Number.isFinite(fetchedAt)) return null
    const ttl = data.found ? HIT_TTL_MS : MISS_TTL_MS
    if (Date.now() - fetchedAt > ttl) return null
    const value = emptyResult(nameKey, {
      found: Boolean(data.found),
      name: (data.display_name as string | null) ?? null,
      steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
      muscles: Array.isArray(data.muscles) ? (data.muscles as string[]) : [],
      videos: Array.isArray(data.videos) ? (data.videos as MuscleWikiVideo[]) : [],
      exerciseId: data.musclewiki_id != null ? Number(data.musclewiki_id) : null,
    })
    memory.set(nameKey, { expiresAt: fetchedAt + ttl, value })
    return value
  } catch {
    return null
  }
}

async function writeCache(nameKey: string, value: ExerciseFormResult): Promise<void> {
  const ttl = value.found ? HIT_TTL_MS : MISS_TTL_MS
  memory.set(nameKey, { expiresAt: Date.now() + ttl, value })
  try {
    const admin = createAdminClient()
    await admin.from('exercise_form_cache').upsert(
      {
        name_key: nameKey,
        musclewiki_id: value.exerciseId,
        display_name: value.name,
        steps: value.steps,
        muscles: value.muscles,
        videos: value.videos,
        found: value.found,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'name_key' }
    )
  } catch {
    /* table may not exist yet — memory cache still helps warm instances */
  }
}

export async function lookupExerciseForm(rawName: string): Promise<ExerciseFormResult> {
  const query = applyExerciseAliases(normalizeExerciseQuery(rawName))
  if (shouldSkipExerciseForm(rawName) || !query) {
    return emptyResult(query, { skipped: true })
  }
  if (!isMuscleWikiConfigured()) {
    return emptyResult(query, { configured: false })
  }

  const cached = await readCache(query)
  if (cached) return cached

  const hits = await searchMuscleWiki(query, 5)
  const ranked = hits
    .map((hit) => ({ hit, score: matchScore(query, hit.name) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < MIN_ACCEPT_SCORE) {
    const miss = emptyResult(query)
    await writeCache(query, miss)
    return miss
  }

  const detailed = (await getMuscleWikiExercise(best.hit.id)) ?? best.hit
  const value = fromExercise(query, detailed)
  await writeCache(query, value)
  return value
}
