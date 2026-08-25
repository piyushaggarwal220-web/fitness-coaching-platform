import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMuscleWikiExercise,
  inferEquipmentCategory,
  isMuscleWikiConfigured,
  listFormVideoOptions,
  searchMuscleWiki,
  type FormDemoGender,
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
const CACHE_VERSION = 'v2'

export type ExerciseFormDetails = {
  category: string | null
  difficulty: string | null
  force: string | null
  mechanic: string | null
  grips: string[]
}

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
  details: ExerciseFormDetails
}

const memory = new Map<string, { expiresAt: number; value: ExerciseFormResult }>()

function emptyDetails(): ExerciseFormDetails {
  return { category: null, difficulty: null, force: null, mechanic: null, grips: [] }
}

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
    details: emptyDetails(),
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
    steps: exercise.steps,
    muscles: exercise.muscles,
    videos: exercise.videos,
    exerciseId: exercise.id,
    details: {
      category: exercise.category,
      difficulty: exercise.difficulty,
      force: exercise.force,
      mechanic: exercise.mechanic,
      grips: exercise.grips,
    },
  }
}

function cacheKey(query: string): string {
  return `${CACHE_VERSION}:${query}`
}

function unpackCachedVideos(raw: unknown): {
  videos: MuscleWikiVideo[]
  details: ExerciseFormDetails
} {
  if (Array.isArray(raw)) {
    return { videos: raw as MuscleWikiVideo[], details: emptyDetails() }
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
    const packed = raw as { items: MuscleWikiVideo[]; details?: Partial<ExerciseFormDetails> }
    return {
      videos: packed.items,
      details: {
        ...emptyDetails(),
        ...packed.details,
        grips: Array.isArray(packed.details?.grips) ? packed.details.grips : [],
      },
    }
  }
  return { videos: [], details: emptyDetails() }
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
    const packed = unpackCachedVideos(data.videos)
    const value = emptyResult(nameKey, {
      found: Boolean(data.found),
      name: (data.display_name as string | null) ?? null,
      steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
      muscles: Array.isArray(data.muscles) ? (data.muscles as string[]) : [],
      videos: packed.videos,
      details: packed.details,
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
        videos: { v: 2, items: value.videos, details: value.details },
        found: value.found,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'name_key' }
    )
  } catch {
    /* table may not exist yet — memory cache still helps warm instances */
  }
}

function rankHits(query: string, hits: MuscleWikiExercise[]) {
  const category = inferEquipmentCategory(query)
  return hits
    .map((hit) => {
      let score = matchScore(query, hit.name)
      if (category && hit.category?.toLowerCase() === category) score += 8
      return { hit, score }
    })
    .sort((a, b) => b.score - a.score)
}

export function publicFormPayload(result: ExerciseFormResult, preferredGender: FormDemoGender) {
  return {
    configured: result.configured,
    skipped: result.skipped,
    found: result.found,
    name: result.name,
    steps: result.steps,
    muscles: result.muscles,
    category: result.details.category,
    difficulty: result.details.difficulty,
    force: result.details.force,
    mechanic: result.details.mechanic,
    grips: result.details.grips,
    exerciseId: result.exerciseId,
    preferredGender,
    videos: listFormVideoOptions(result.videos),
    hasVideo: result.videos.length > 0,
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

  const key = cacheKey(query)
  const cached = await readCache(key)
  if (cached) return cached

  const hits = await searchMuscleWiki(query, 8)
  const ranked = rankHits(query, hits)
  const best = ranked[0]
  if (!best || best.score < MIN_ACCEPT_SCORE) {
    const miss = emptyResult(query)
    await writeCache(key, miss)
    return miss
  }

  const detailed = (await getMuscleWikiExercise(best.hit.id)) ?? best.hit
  const value = fromExercise(query, detailed)
  await writeCache(key, value)
  return value
}
