const BASE = 'https://api.musclewiki.com'

export type FormDemoGender = 'male' | 'female'

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
  category: string | null
  difficulty: string | null
  force: string | null
  mechanic: string | null
  grips: string[]
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
  const keys = Object.keys(rec)
  if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map((key) => rec[key])
  }
  return []
}

function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
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
    const preview = resolveMediaUrl(
      (typeof rec?.og_image === 'string' && rec.og_image) ||
        (typeof rec?.preview === 'string' && rec.preview) ||
        (typeof rec?.thumbnail === 'string' && rec.thumbnail) ||
        (typeof rec?.preview_url === 'string' && rec.preview_url) ||
        ''
    )
    videos.push({ url: resolved, gender, angle: angle || inferred.angle, previewUrl: preview })
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
    category: optionalText(rec.category ?? rec.equipment),
    difficulty: optionalText(rec.difficulty),
    force: optionalText(rec.force),
    mechanic: optionalText(rec.mechanic),
    grips: stringList(rec.grips),
  }
}

export function inferEquipmentCategory(query: string): string | null {
  const q = query.toLowerCase()
  if (/\b(barbell|bb)\b/.test(q)) return 'barbell'
  if (/\b(dumbbell|db)\b/.test(q)) return 'dumbbell'
  if (/\bcable\b/.test(q)) return 'cable'
  if (/\bsmith\b/.test(q)) return 'smith machine'
  if (/\bkettlebell\b/.test(q)) return 'kettlebells'
  if (/\b(band|resistance band)\b/.test(q)) return 'bands'
  if (/\b(machine|leg press|hack squat|lat pulldown)\b/.test(q)) return 'machine'
  return null
}

async function collectSearchHits(path: string, into: Map<number, MuscleWikiExercise>): Promise<void> {
  const json = await mwFetch(path)
  for (const row of asList(json).map(parseExercise)) {
    if (row && !into.has(row.id)) into.set(row.id, row)
  }
}

export async function searchMuscleWiki(query: string, limit = 8): Promise<MuscleWikiExercise[]> {
  const q = encodeURIComponent(query)
  const capped = Math.max(1, Math.min(20, limit))
  const category = inferEquipmentCategory(query)
  const hits = new Map<number, MuscleWikiExercise>()
  try {
    await collectSearchHits(`/search?q=${q}&limit=${capped}`, hits)
  } catch {
    /* fall through */
  }
  if (hits.size === 0 && category) {
    try {
      await collectSearchHits(
        `/search?q=${q}&limit=${capped}&category=${encodeURIComponent(category)}`,
        hits
      )
    } catch {
      /* fall through */
    }
  }
  if (hits.size === 0) {
    try {
      await collectSearchHits(`/exercises?search=${q}&limit=${capped}`, hits)
    } catch {
      /* ignore */
    }
  }
  return [...hits.values()]
}

export async function getMuscleWikiExercise(id: number): Promise<MuscleWikiExercise | null> {
  const json = await mwFetch(`/exercises/${id}?detail=true`)
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
  gender: FormDemoGender = 'male',
  angle?: string | null
): MuscleWikiVideo | null {
  if (videos.length === 0) return null
  const wantedAngle = (angle ?? 'front').toLowerCase()
  const sameGender = videos.filter((v) => v.gender === gender)
  const pool = sameGender.length > 0 ? sameGender : videos
  const exact = pool.find((v) => v.angle.toLowerCase() === wantedAngle)
  if (exact) return exact
  const front = pool.find((v) => /front/i.test(v.angle))
  return front ?? pool[0] ?? null
}

export function listFormVideoOptions(videos: MuscleWikiVideo[]): Array<{
  gender: FormDemoGender
  angle: string
  hasPoster: boolean
}> {
  const seen = new Set<string>()
  const out: Array<{ gender: FormDemoGender; angle: string; hasPoster: boolean }> = []
  for (const video of videos) {
    if (video.gender !== 'male' && video.gender !== 'female') continue
    const angle = video.angle.toLowerCase() || 'front'
    const key = `${video.gender}:${angle}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ gender: video.gender, angle, hasPoster: Boolean(video.previewUrl) })
  }
  return out
}

/** Only the onboarding gender — never offer the other model as a browse option. */
export function videosForDemoGender(
  videos: MuscleWikiVideo[],
  preferred: FormDemoGender
): ReturnType<typeof listFormVideoOptions> {
  const all = listFormVideoOptions(videos)
  const match = all.filter((item) => item.gender === preferred)
  return match.length > 0 ? match : all
}

const ANGLE_ORDER = ['front', 'side', 'rear', 'back', '45']

export function orderFormAngles(angles: string[]): string[] {
  const unique = [...new Set(angles.map((angle) => angle.toLowerCase() || 'front'))]
  return unique.sort((a, b) => {
    const ia = ANGLE_ORDER.indexOf(a)
    const ib = ANGLE_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
}

type CachedMedia = { body: Uint8Array; contentType: string }
const MEDIA_CACHE_MAX_ITEMS = 24
const MEDIA_CACHE_MAX_BYTES = 80 * 1024 * 1024
const mediaCache = new Map<string, CachedMedia>()
const mediaInflight = new Map<string, Promise<CachedMedia>>()
let mediaCacheBytes = 0

function rememberMedia(url: string, item: CachedMedia) {
  const previous = mediaCache.get(url)
  if (previous) {
    mediaCache.delete(url)
    mediaCacheBytes -= previous.body.byteLength
  }
  mediaCache.set(url, item)
  mediaCacheBytes += item.body.byteLength
  while (
    mediaCache.size > 0 &&
    (mediaCache.size > MEDIA_CACHE_MAX_ITEMS || mediaCacheBytes > MEDIA_CACHE_MAX_BYTES)
  ) {
    const oldest = mediaCache.keys().next().value
    if (!oldest || oldest === url) break
    const drop = mediaCache.get(oldest)
    mediaCache.delete(oldest)
    if (drop) mediaCacheBytes -= drop.body.byteLength
  }
}

/**
 * Fetch a MuscleWiki clip once, then serve repeats/range requests from memory.
 * HTML5 <video> fires several Range GETs; forwarding each one bills another credit.
 */
export async function getCachedMuscleWikiMedia(url: string): Promise<CachedMedia> {
  const hit = mediaCache.get(url)
  if (hit) {
    mediaCache.delete(url)
    mediaCache.set(url, hit)
    return hit
  }
  const pending = mediaInflight.get(url)
  if (pending) return pending
  const job = (async () => {
    const res = await fetchMuscleWikiMedia(url, null)
    if (!res.ok) throw new Error(`MuscleWiki media ${res.status}`)
    const body = new Uint8Array(await res.arrayBuffer())
    const item = {
      body,
      contentType: res.headers.get('content-type') ?? 'video/mp4',
    }
    rememberMedia(url, item)
    return item
  })()
  mediaInflight.set(url, job)
  try {
    return await job
  } finally {
    mediaInflight.delete(url)
  }
}

export function mediaResponseFromCache(
  item: CachedMedia,
  rangeHeader: string | null
): Response {
  const { body, contentType } = item
  const size = body.byteLength
  const headers = new Headers({
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400, immutable',
  })
  const match = rangeHeader?.trim().match(/^bytes=(\d*)-(\d*)$/i)
  if (!match) {
    headers.set('Content-Length', String(size))
    return new Response(body, { status: 200, headers })
  }
  const start = match[1] ? Number(match[1]) : 0
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  const end = Math.min(requestedEnd, size - 1)
  headers.set('Content-Length', String(end - start + 1))
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  return new Response(body.slice(start, end + 1), { status: 206, headers })
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
