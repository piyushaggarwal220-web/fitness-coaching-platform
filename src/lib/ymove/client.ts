/** Server-only YMove Exercise Videos API client. Never import from client components. */

const YMOVE_BASE = 'https://exercise-api.ymove.app/api/v2'

export type YMoveExerciseVideo = {
  videoUrl?: string | null
  videoHlsUrl?: string | null
  thumbnailUrl?: string | null
  tag?: string | null
  orientation?: string | null
  isPrimary?: boolean
}

export type YMoveExercise = {
  id: string
  title: string
  slug: string
  description?: string | null
  instructions?: string[] | null
  importantPoints?: string[] | null
  muscleGroup?: string | null
  secondaryMuscles?: string[] | null
  equipment?: string | null
  category?: string | null
  difficulty?: string | null
  hasVideo?: boolean
  videoUrl?: string | null
  videoHlsUrl?: string | null
  thumbnailUrl?: string | null
  videos?: YMoveExerciseVideo[] | null
  exerciseType?: string[] | null
}

export type YMoveListResult = {
  data: YMoveExercise[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type YMoveListParams = {
  search?: string
  muscleGroup?: string
  equipment?: string
  exerciseType?: string
  difficulty?: string
  page?: number
  pageSize?: number
  /** Include signed video URLs (counts toward monthly quota). Default false for browse. */
  includeVideos?: boolean
  hasVideo?: boolean
}

function getApiKey(): string {
  const key = process.env.EXERCISE_VIDEO_API_KEY?.trim()
  if (!key) {
    throw new Error('EXERCISE_VIDEO_API_KEY is not configured')
  }
  return key
}

async function ymoveFetch<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(`${YMOVE_BASE}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-Key': getApiKey(),
      Accept: 'application/json',
    },
    // Video tokens expire; don't cache aggressively on the CDN edge.
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`YMove API ${res.status}: ${body.slice(0, 200) || res.statusText}`)
  }

  return (await res.json()) as T
}

export async function listYMoveExercises(params: YMoveListParams = {}): Promise<YMoveListResult> {
  return ymoveFetch<YMoveListResult>('/exercises', {
    search: params.search,
    muscleGroup: params.muscleGroup,
    equipment: params.equipment,
    exerciseType: params.exerciseType,
    difficulty: params.difficulty,
    page: params.page ?? 1,
    // API uses pageSize in docs; also try limit if needed
    pageSize: params.pageSize ?? 20,
    limit: params.pageSize ?? 20,
    includeVideos: params.includeVideos ?? false,
    hasVideo: params.hasVideo ?? true,
  })
}

export async function getYMoveExercise(
  idOrSlug: string,
  options?: { includeVideos?: boolean }
): Promise<YMoveExercise> {
  const includeVideos = options?.includeVideos ?? true
  const result = await ymoveFetch<YMoveExercise | { data: YMoveExercise }>(
    `/exercises/${encodeURIComponent(idOrSlug)}`,
    { includeVideos }
  )
  if (result && typeof result === 'object' && 'data' in result && result.data) {
    return result.data
  }
  return result as YMoveExercise
}

/** Best-effort match by exercise name for in-tracker demos. */
export async function findYMoveExerciseByName(name: string): Promise<YMoveExercise | null> {
  const cleaned = name.trim().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.length < 2) return null

  const listed = await listYMoveExercises({
    search: cleaned,
    pageSize: 8,
    includeVideos: true,
    hasVideo: true,
  })

  if (!listed.data?.length) return null

  const lower = cleaned.toLowerCase()
  const exact = listed.data.find((ex) => ex.title.toLowerCase() === lower)
  if (exact) return exact

  const starts = listed.data.find((ex) => ex.title.toLowerCase().startsWith(lower) || lower.startsWith(ex.title.toLowerCase()))
  if (starts) return starts

  return listed.data[0] ?? null
}

export function pickPrimaryVideo(ex: YMoveExercise): {
  videoUrl: string | null
  thumbnailUrl: string | null
} {
  const primary = ex.videos?.find((v) => v.isPrimary) ?? ex.videos?.[0]
  return {
    videoUrl: primary?.videoUrl ?? ex.videoUrl ?? null,
    thumbnailUrl: primary?.thumbnailUrl ?? ex.thumbnailUrl ?? null,
  }
}
