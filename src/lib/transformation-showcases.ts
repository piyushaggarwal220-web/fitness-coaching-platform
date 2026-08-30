import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTransformationScores, scoreRowForShowcase, type TransformationScoreRow } from '@/lib/transformation-scores'

export type TransformationShowcaseStatus = 'candidate' | 'approved' | 'published' | 'rejected'

export type TransformationShowcaseRow = {
  id: string
  clientId: string
  clientName: string | null
  coachId: string | null
  status: TransformationShowcaseStatus
  scoreSnapshot: number | null
  gradeSnapshot: string | null
  quote: string | null
  beforePhotoUrl: string | null
  afterPhotoUrl: string | null
  weightStartKg: number | null
  weightLatestKg: number | null
  weightChangeKg: number | null
  weeksActive: number | null
  marketingPhotoConsent: boolean
  createdAt: string
  publishedAt: string | null
}

async function latestWeeklyPhoto(admin: SupabaseClient, clientId: string): Promise<string | null> {
  const { data } = await admin
    .from('checkins')
    .select('progress_photo_front')
    .eq('client_id', clientId)
    .eq('checkin_type', 'weekly')
    .not('progress_photo_front', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.progress_photo_front as string | null) ?? null
}

export async function nominateClientForShowcase(
  admin: SupabaseClient,
  input: {
    clientId: string
    coachId: string
    nominatedBy: string
    quote?: string | null
    scoreRow?: TransformationScoreRow | null
  }
): Promise<{ id: string } | { error: string }> {
  let row = input.scoreRow
  if (!row) {
    const scores = await loadTransformationScores({ clientIds: [input.clientId] })
    row = scores[0] ?? null
  }
  if (!row) return { error: 'Client has no transformation data yet.' }
  if (!scoreRowForShowcase(row)) {
    return { error: 'Client needs Grade A/B, before/after photos, and at least 4 weeks on plan.' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('progress_photo_front, marketing_photo_consent_at')
    .eq('id', input.clientId)
    .maybeSingle()
  const beforePhoto = (profile?.progress_photo_front as string | null) ?? null
  const afterPhoto = await latestWeeklyPhoto(admin, input.clientId)
  if (!beforePhoto || !afterPhoto) {
    return { error: 'Before and after photos are required.' }
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('transformation_showcases')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      status: 'candidate',
      score_snapshot: row.score,
      grade_snapshot: row.grade,
      quote: input.quote?.trim().slice(0, 500) || null,
      before_photo_url: beforePhoto,
      after_photo_url: afterPhoto,
      weight_start_kg: row.weightStart,
      weight_latest_kg: row.weightLatest,
      weight_change_kg: row.weightChangeKg,
      weeks_active: row.weeksActive,
      nominated_by: input.nominatedBy,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'This client already has an open showcase nomination.' }
    return { error: error.message }
  }
  return { id: data.id }
}

export async function loadTransformationShowcases(
  admin: SupabaseClient,
  options?: { coachId?: string; status?: TransformationShowcaseStatus[] }
): Promise<TransformationShowcaseRow[]> {
  let query = admin
    .from('transformation_showcases')
    .select(
      'id, client_id, coach_id, status, score_snapshot, grade_snapshot, quote, before_photo_url, after_photo_url, weight_start_kg, weight_latest_kg, weight_change_kg, weeks_active, created_at, published_at'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (options?.coachId) query = query.eq('coach_id', options.coachId)
  if (options?.status?.length) query = query.in('status', options.status)

  const { data } = await query
  const rows = data ?? []
  const clientIds = [...new Set(rows.map((r) => r.client_id as string))]
  const consentByClient = new Map<string, { name: string | null; marketingPhotoConsent: boolean }>()
  if (clientIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name, marketing_photo_consent_at')
      .in('id', clientIds)
    for (const p of profiles ?? []) {
      consentByClient.set(p.id as string, {
        name: (p.name as string | null) ?? null,
        marketingPhotoConsent: Boolean(p.marketing_photo_consent_at),
      })
    }
  }

  return rows.map((row) => {
    const profile = consentByClient.get(row.client_id as string)
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: profile?.name ?? null,
      coachId: (row.coach_id as string | null) ?? null,
      status: row.status as TransformationShowcaseStatus,
      scoreSnapshot: row.score_snapshot as number | null,
      gradeSnapshot: row.grade_snapshot as string | null,
      quote: row.quote as string | null,
      beforePhotoUrl: row.before_photo_url as string | null,
      afterPhotoUrl: row.after_photo_url as string | null,
      weightStartKg: row.weight_start_kg as number | null,
      weightLatestKg: row.weight_latest_kg as number | null,
      weightChangeKg: row.weight_change_kg as number | null,
      weeksActive: row.weeks_active as number | null,
      marketingPhotoConsent: profile?.marketingPhotoConsent ?? false,
      createdAt: row.created_at as string,
      publishedAt: (row.published_at as string | null) ?? null,
    }
  })
}

export async function updateShowcaseStatus(
  admin: SupabaseClient,
  showcaseId: string,
  input: {
    status: TransformationShowcaseStatus
    approvedBy: string
    adminNote?: string | null
  }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: input.status,
    approved_by: input.approvedBy,
    admin_note: input.adminNote?.trim().slice(0, 500) || null,
    updated_at: now,
  }
  if (input.status === 'published') patch.published_at = now
  if (input.status === 'rejected') patch.published_at = null

  const { error } = await admin.from('transformation_showcases').update(patch).eq('id', showcaseId)
  return { error: error?.message ?? null }
}
