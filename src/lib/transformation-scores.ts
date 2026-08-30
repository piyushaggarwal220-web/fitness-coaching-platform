import { createAdminClient } from '@/lib/supabase/admin'

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export type TransformationScoreRow = {
  clientId: string
  name: string | null
  email: string | null
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  weightStart: number | null
  weightLatest: number | null
  weightChangeKg: number | null
  checkinCount: number
  photoPairs: number
  weeksActive: number | null
  marketingPhotoConsent: boolean
  marketingQuoteConsent: boolean
  showcaseStatus: string | null
  breakdown: {
    body: number
    consistency: number
    photos: number
    time: number
  }
}

export type LoadTransformationScoresOptions = {
  coachId?: string
  clientIds?: string[]
}

function gradeFor(score: number): TransformationScoreRow['grade'] {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

export async function loadTransformationScores(
  options: LoadTransformationScoresOptions = {}
): Promise<TransformationScoreRow[]> {
  const admin = createAdminClient()

  let profileQuery = admin
    .from('profiles')
    .select(
      'id, name, email, weight, onboarding_data, checkin_schedule_started_at, progress_photo_front, progress_photo_side, progress_photo_back, marketing_photo_consent_at, marketing_quote_consent_at, coach_id'
    )
    .eq('onboarding_complete', true)

  if (options.coachId) {
    profileQuery = profileQuery.eq('coach_id', options.coachId)
  }
  if (options.clientIds?.length) {
    profileQuery = profileQuery.in('id', options.clientIds)
  }

  const { data: profiles } = await profileQuery.limit(400)

  const ids = (profiles ?? []).map((p) => p.id as string)
  if (ids.length === 0) return []

  const [{ data: checkins }, { data: showcases }] = await Promise.all([
    admin
      .from('checkins')
      .select('client_id, weight, submitted_at, diet_adherence, workout_adherence, progress_photo_front, checkin_type')
      .in('client_id', ids)
      .eq('checkin_type', 'weekly')
      .order('submitted_at', { ascending: true }),
    admin
      .from('transformation_showcases')
      .select('client_id, status')
      .in('client_id', ids)
      .in('status', ['candidate', 'approved', 'published']),
  ])

  const showcaseByClient = new Map<string, string>()
  for (const row of showcases ?? []) {
    showcaseByClient.set(row.client_id as string, row.status as string)
  }

  const byClient = new Map<string, typeof checkins>()
  for (const row of checkins ?? []) {
    const id = row.client_id as string
    const list = byClient.get(id) ?? []
    list.push(row)
    byClient.set(id, list)
  }

  const rows: TransformationScoreRow[] = []
  const now = Date.now()

  for (const profile of profiles ?? []) {
    const startWeight = asNumber(profile.weight)
    const target = asNumber(
      (profile.onboarding_data as { goals?: { targetWeight?: unknown } } | null)?.goals?.targetWeight
    )
    const list = byClient.get(profile.id as string) ?? []
    const last = list[list.length - 1]
    const latestWeight = asNumber(last?.weight) ?? startWeight

    let body = 0
    let weightChangeKg: number | null = null
    if (startWeight != null && latestWeight != null) {
      weightChangeKg = Math.round((latestWeight - startWeight) * 10) / 10
      const direction = target != null && target > startWeight ? 1 : -1
      const moved = (latestWeight - startWeight) * direction
      const needed = target != null ? Math.abs(target - startWeight) : Math.max(4, startWeight * 0.08)
      body = Math.max(0, Math.min(40, Math.round((moved / needed) * 40)))
    }

    const adherence = list.slice(-4).map((c) => {
      const d = asNumber(c.diet_adherence) ?? 0
      const w = asNumber(c.workout_adherence) ?? 0
      return (d + w) / 2
    })
    const avgAdherence = adherence.length ? adherence.reduce((a, b) => a + b, 0) / adherence.length : 0
    const consistency = Math.round(Math.min(30, (avgAdherence / 10) * 20 + Math.min(10, list.length * 2)))

    const startPhotos = [profile.progress_photo_front, profile.progress_photo_side, profile.progress_photo_back].filter(Boolean).length
    const laterPhotos = list.filter((c) => c.progress_photo_front).length
    const photoPairs = startPhotos > 0 && laterPhotos > 0 ? 1 : 0
    const photos = Math.min(20, (startPhotos > 0 ? 8 : 0) + Math.min(12, laterPhotos * 4))

    let weeksActive: number | null = null
    if (profile.checkin_schedule_started_at) {
      weeksActive = Math.max(
        0,
        Math.floor(
          (now - new Date(profile.checkin_schedule_started_at as string).getTime()) / (7 * 24 * 60 * 60 * 1000)
        )
      )
    }
    const time = Math.min(10, Math.round(((weeksActive ?? 0) / 12) * 10))

    const score = Math.max(0, Math.min(100, body + consistency + photos + time))
    if (list.length === 0 && startPhotos === 0) continue

    rows.push({
      clientId: profile.id as string,
      name: (profile.name as string | null) ?? null,
      email: (profile.email as string | null) ?? null,
      score,
      grade: gradeFor(score),
      weightStart: startWeight,
      weightLatest: latestWeight,
      weightChangeKg,
      checkinCount: list.length,
      photoPairs,
      weeksActive,
      marketingPhotoConsent: Boolean(profile.marketing_photo_consent_at),
      marketingQuoteConsent: Boolean(profile.marketing_quote_consent_at),
      showcaseStatus: showcaseByClient.get(profile.id as string) ?? null,
      breakdown: { body, consistency, photos, time },
    })
  }

  return rows.sort((a, b) => b.score - a.score)
}

export function scoreRowForShowcase(row: TransformationScoreRow): boolean {
  return (
    (row.grade === 'A' || row.grade === 'B') &&
    row.photoPairs === 1 &&
    (row.weeksActive ?? 0) >= 4 &&
    row.checkinCount >= 2
  )
}
