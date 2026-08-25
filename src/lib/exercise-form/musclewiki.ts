const BASE = 'https://api.musclewiki.com'

export type MuscleWikiVideo = {
  url: string
  gender: 'male' | 'female' | 'unknown'
  angle: string
  previewUrl: string | null
}

export type MuscleWikiExercise = {
  id: number
  name: string
  steps: string[]
  muscles: string[]
  videos: MuscleWikiVideo[]
}

function apiKey(): string | null {
  const key = process.env.MUSCLEWIKI_API_KEY?.trim()
  return key || null
}

export function isMuscleWikiConfigured(): boolean {
  return Boolean(apiKey())
}

async function mwFetch(path: string): Promise<unknown> {
  const key = apiKey()
  if (!key) throw new Error('MUSCLEWIKI_API_KEY is not set')
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-API-Key': key, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MuscleWiki ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`)
  }
  return res.json()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const rec = asRecord(value)
  if (!rec) return []
  if (Array.isArray(rec.results)) return rec.results
  if (Array.isArray(rec.exercises)) return rec.exercises
  if (Array.isArray(rec.data)) return rec.data
  return []
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
    else if (item && typeof item === 'object' && 'name' in item) {
      const name = String((item as { name?: unknown }).name ?? '').trim()
      if (name) out.push(name)
    }
  }
  return out
}

function resolveMediaUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  if (url.startsWith('https://api.musclewiki.com/')) return url
  if (url.startsWith('/stream/')) return `${BASE}${url}`
  return null
}

function inferFromFilename(url: string): { gender: MuscleWikiVideo['gender']; angle: string } {
  const file = url.split('?')[0]?.split('/').pop() ?? ''
  const gender: MuscleWikiVideo['gender'] = file.startsWith('female-')
    ? 'female'
    : file.startsWith('male-')
      ? 'male'
      : 'unknown'
  const angleMatch = file.match(/-(front|side|rear|back|45)(?:[-.]|$)/i)
  return { gender, angle: (angleMatch?.[1] ?? 'front').toLowerCase() }
}

function parseVideos(raw: unknown): MuscleWikiVideo[] {
  if (!Array.isArray(raw)) return []
  const videos: MuscleWikiVideo[] = []
  for (const item of raw) {
    const rec = asRecord(item)
    const resolved = resolveMediaUrl(
      (typeof rec?.url === 'string' && rec.url) ||
        (typeof rec?.video_url === 'string' && rec.video_url) ||
        (typeof rec?.videoURL === 'string' && rec.videoURL) ||
        (typeof item === 'string' ? item : '')
    )
    if (!resolved) continue
    const inferred = inferFromFilename(resolved)
    const genderRaw = String(rec?.gender ?? rec?.sex ?? '').toLowerCase()
    const gender: MuscleWikiVideo['gender'] =
      genderRaw === 'female' || genderRaw === 'male' ? genderRaw : inferred.gender
    const angle = String(rec?.angle ?? rec?.view ?? rec?.camera ?? inferred.angle).toLowerCase()
    const preview =
      (typeof rec?.preview === 'string' && rec.preview) ||
      (typeof rec?.thumbnail === 'string' && rec.thumbnail) ||
      (typeof rec?.preview_url === 'string' && rec.preview_url) ||
      null
    videos.push({ url: resolved, gender, angle, previewUrl: preview })
  }
  return videos
}

function parseExercise(raw: unknown): MuscleWikiExercise | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const id = Number(rec.id)
  const name = String(rec.name ?? rec.exercise_name ?? rec.title ?? '').trim()
  if (!Number.isFinite(id) || id <= 0 || !name) return null
  const muscles = [
    ...stringList(rec.muscles),
    ...stringList(rec.primary_muscles),
    ...stringList(asRecord(rec.target)?.Primary),
    ...stringList(asRecord(rec.target)?.primary),
  ]
  return {
    id,
    name,
    steps: stringList(rec.steps ?? rec.instructions),
    muscles: [...new Set(muscles)],
    videos: parseVideos(rec.videos ?? rec.videoURL ?? rec.video_urls),
  }
}

export async function searchMuscleWiki(query: string, limit = 5): Promise<MuscleWikiExercise[]> {
  const q = encodeURIComponent(query)
  const json = await mwFetch(`/search?q=${q}&limit=${Math.max(1, Math.min(10, limit))}`)
  return asList(json).map(parseExercise).filter((row): row is MuscleWikiExercise => Boolean(row))
}

export async function getMuscleWikiExercise(id: number): Promise<MuscleWikiExercise | null> {
  const json = await mwFetch(`/exercises/${id}`)
  const rec = asRecord(json)
  const payload = rec?.exercise ?? rec?.data ?? json
  const parsed = parseExercise(payload)
  if (parsed?.videos.length) return parsed
  try {
    const videosJson = await mwFetch(`/exercises/${id}/videos`)
    const extra = parseVideos(
      asRecord(videosJson)?.videos ?? asRecord(videosJson)?.data ?? videosJson
    )
    if (parsed) return { ...parsed, videos: extra.length ? extra : parsed.videos }
  } catch {
    /* keep parsed without extra videos */
  }
  return parsed
}

export function pickFormVideo(
  videos: MuscleWikiVideo[],
  gender: 'male' | 'female' = 'male'
): MuscleWikiVideo | null {
  if (videos.length === 0) return null
  const preferred = videos.find(
    (v) => v.gender === gender && /front/i.test(v.angle)
  )
  if (preferred) return preferred
  const sameGender = videos.find((v) => v.gender === gender)
  return sameGender ?? videos[0] ?? null
}

export function isAllowedMuscleWikiMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'api.musclewiki.com'
  } catch {
    return false
  }
}

export async function fetchMuscleWikiMedia(
  url: string,
  rangeHeader: string | null
): Promise<Response> {
  const key = apiKey()
  if (!key) throw new Error('MUSCLEWIKI_API_KEY is not set')
  if (!isAllowedMuscleWikiMediaUrl(url)) {
    throw new Error('Unexpected media host')
  }
  const headers: Record<string, string> = { 'X-API-Key': key }
  if (rangeHeader) headers.Range = rangeHeader
  return fetch(url, { headers, cache: 'no-store' })
}
