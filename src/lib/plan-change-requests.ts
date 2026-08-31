import 'server-only'
import { editPlanForClientChange } from '@/lib/ai/edit-plan-section'
import { formatCalorieGuidanceBlock } from '@/lib/ai/calorie-targets'
import { loadClientJourneySnapshot } from '@/lib/ai/client-journey'
import { SAFE_RATE_OF_CHANGE_RULE } from '@/lib/ai/safe-change-policy'
import {
  CLIENT_PLAN_EDIT_WEEK_RULES,
  FRESH_PLAN_OUTPUT_RULES,
} from '@/lib/ai/plan-prose-guards'
import {
  canClaimPlanChangeGeneration,
  notesBelongToPlanChangeRequest,
  planChangeRequestMarker,
  stillOwnsPlanChangeClaim,
} from '@/lib/plan-change-policy'
import { encodePlanMeta } from '@/lib/plan-metadata'
import { persistAiPlanDraft, updateAiPlanDraft } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan, PlanFormData } from '@/types/database'

export const PLAN_CHANGE_DAILY_LIMIT = 1
export const PLAN_CHANGE_MONTHLY_LIMIT = 5
export const PLAN_CHANGE_MIN_CHARS = 10
export const PLAN_CHANGE_MAX_CHARS = 4000

/** Word-overlap similarity; used only for logging near-copy edits. */
export function planTextSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
  const wa = tokenize(a)
  const wb = tokenize(b)
  if (wa.size === 0 && wb.size === 0) return 1
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter += 1
  return inter / Math.max(wa.size, wb.size)
}

const NEAR_COPY_SIMILARITY = 0.93

function logNearCopyWarning(section: string, similarity: number, requestId: string): void {
  if (similarity >= NEAR_COPY_SIMILARITY) {
    console.warn(
      `[plan-change] ${section} edit was very similar to the active plan (${similarity.toFixed(2)}) for request ${requestId}`
    )
  }
}

export type PlanChangeScope = 'diet' | 'workout' | 'both'

export type PlanChangeRequestRow = {
  id: string
  client_id: string
  coach_id: string
  active_plan_id: string | null
  draft_plan_id: string | null
  request_text: string
  scope: PlanChangeScope
  status: string
  error_message: string | null
  locked_at: string
  generation_started_at: string | null
  draft_ready_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type PlanChangeQuota = {
  usedToday: number
  usedThisMonth: number
  remainingToday: number
  remainingThisMonth: number
  canSubmit: boolean
  openRequest: PlanChangeRequestRow | null
}

function startOfLocalDayIso(d = new Date()): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

function startOfMonthIso(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

export async function getPlanChangeQuota(clientId: string): Promise<PlanChangeQuota> {
  const admin = createAdminClient()
  const dayStart = startOfLocalDayIso()
  const monthStart = startOfMonthIso()

  const [{ data: todayRows }, { data: monthRows }, { data: openRows }] = await Promise.all([
    admin
      .from('plan_change_requests')
      .select('id')
      .eq('client_id', clientId)
      .gte('locked_at', dayStart),
    admin
      .from('plan_change_requests')
      .select('id')
      .eq('client_id', clientId)
      .gte('locked_at', monthStart),
    admin
      .from('plan_change_requests')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['generating', 'draft_ready', 'in_review'])
      .order('locked_at', { ascending: false })
      .limit(1),
  ])

  const usedToday = todayRows?.length ?? 0
  const usedThisMonth = monthRows?.length ?? 0
  const remainingToday = Math.max(0, PLAN_CHANGE_DAILY_LIMIT - usedToday)
  const remainingThisMonth = Math.max(0, PLAN_CHANGE_MONTHLY_LIMIT - usedThisMonth)
  const openRequest = (openRows?.[0] as PlanChangeRequestRow | undefined) ?? null

  return {
    usedToday,
    usedThisMonth,
    remainingToday,
    remainingThisMonth,
    canSubmit: remainingToday > 0 && remainingThisMonth > 0 && !openRequest,
    openRequest,
  }
}

export async function createLockedPlanChangeRequest(input: {
  clientId: string
  coachId: string
  activePlanId: string
  requestText: string
  scope: PlanChangeScope
}): Promise<{ ok: true; request: PlanChangeRequestRow } | { ok: false; error: string; status: number }> {
  const text = input.requestText.trim()
  if (text.length < PLAN_CHANGE_MIN_CHARS) {
    return { ok: false, error: 'Please describe all changes you need (at least a short paragraph).', status: 400 }
  }
  if (text.length > PLAN_CHANGE_MAX_CHARS) {
    return { ok: false, error: 'Keep your request under 4000 characters.', status: 400 }
  }
  if (!['diet', 'workout', 'both'].includes(input.scope)) {
    return { ok: false, error: 'Choose diet, workout, or both.', status: 400 }
  }

  const quota = await getPlanChangeQuota(input.clientId)
  if (quota.openRequest) {
    return {
      ok: false,
      error: 'You already have a change request in progress. Wait for your coach to review it.',
      status: 409,
    }
  }
  if (quota.remainingToday <= 0) {
    return {
      ok: false,
      error: 'You can lock in only 1 change request per day. Include every issue in one request next time.',
      status: 429,
    }
  }
  if (quota.remainingThisMonth <= 0) {
    return {
      ok: false,
      error: 'Monthly limit reached (5 change requests per month). Try again next month.',
      status: 429,
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('plan_change_requests')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      active_plan_id: input.activePlanId,
      request_text: text,
      scope: input.scope,
      status: 'generating',
      locked_at: now,
      generation_started_at: null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    if (error?.code === '23505') {
      return {
        ok: false,
        error: 'You already have a change request in progress.',
        status: 409,
      }
    }
    console.error('[plan-change] create failed', error?.message)
    return { ok: false, error: 'Could not lock in your request. Please retry.', status: 500 }
  }

  return { ok: true, request: data as PlanChangeRequestRow }
}

type AdminClient = ReturnType<typeof createAdminClient>

async function findDraftForPlanChangeRequest(
  admin: AdminClient,
  clientId: string,
  requestId: string
): Promise<{ id: string } | null> {
  const marker = planChangeRequestMarker(requestId)
  const { data } = await admin
    .from('plans')
    .select('id, coach_notes')
    .eq('client_id', clientId)
    .eq('active', false)
    .is('delivered_at', null)
    .ilike('coach_notes', `%${marker}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  const match = data?.[0]
  return match && notesBelongToPlanChangeRequest(match.coach_notes, requestId)
    ? { id: match.id }
    : null
}

async function reservePlanChangeDraft(
  admin: AdminClient,
  request: PlanChangeRequestRow,
  active: Plan,
  metaNotes: string
): Promise<string> {
  if (request.draft_plan_id) return request.draft_plan_id

  const existing = await findDraftForPlanChangeRequest(admin, request.client_id, request.id)
  if (existing) {
    await admin
      .from('plan_change_requests')
      .update({ draft_plan_id: existing.id, updated_at: new Date().toISOString() })
      .eq('id', request.id)
      .is('draft_plan_id', null)
    return existing.id
  }

  const form: PlanFormData = {
    client_id: request.client_id,
    title: 'AI Draft · Client request',
    phase: active.phase ?? '',
    nutrition_plan: active.nutrition_plan?.trim() || '',
    workout_plan: active.workout_plan?.trim() || '',
    cardio_plan: active.cardio_plan?.trim() || '',
    supplement_plan: active.supplement_plan?.trim() || '',
    coach_notes: metaNotes,
  }

  const saved = await persistAiPlanDraft(admin, {
    clientId: request.client_id,
    coachId: request.coach_id,
    form,
    title: 'AI Draft · Client request',
  })
  if (saved.error || !saved.data) throw new Error(saved.error ?? 'Failed to reserve draft')

  const { data: linked } = await admin
    .from('plan_change_requests')
    .update({ draft_plan_id: saved.data.id, updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .is('draft_plan_id', null)
    .select('draft_plan_id')
    .maybeSingle()

  if (linked?.draft_plan_id) return linked.draft_plan_id

  const { data: row } = await admin
    .from('plan_change_requests')
    .select('draft_plan_id')
    .eq('id', request.id)
    .maybeSingle()
  if (row?.draft_plan_id) return row.draft_plan_id as string

  return saved.data.id
}

async function claimPlanChangeRequest(
  admin: AdminClient,
  requestId: string
): Promise<PlanChangeRequestRow | null> {
  const now = new Date().toISOString()
  const { data: unclaimed } = await admin
    .from('plan_change_requests')
    .update({ generation_started_at: now, updated_at: now })
    .eq('id', requestId)
    .eq('status', 'generating')
    .is('draft_plan_id', null)
    .is('generation_started_at', null)
    .select('*')
    .maybeSingle()

  if (unclaimed) return unclaimed as PlanChangeRequestRow

  const { data: current } = await admin
    .from('plan_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()

  const row = current as PlanChangeRequestRow | null
  if (
    !row ||
    !canClaimPlanChangeGeneration({
      status: row.status,
      generationStartedAt: row.generation_started_at,
      draftPlanId: row.draft_plan_id,
      draftReadyAt: row.draft_ready_at,
    })
  ) {
    return null
  }

  const { data: reclaimed } = await admin
    .from('plan_change_requests')
    .update({ generation_started_at: now, updated_at: now })
    .eq('id', requestId)
    .eq('status', 'generating')
    .is('draft_plan_id', null)
    .eq('generation_started_at', row.generation_started_at)
    .select('*')
    .maybeSingle()

  return (reclaimed as PlanChangeRequestRow | null) ?? null
}

async function markPlanChangeDraftReady(
  admin: AdminClient,
  requestId: string,
  draftId: string
): Promise<void> {
  const now = new Date().toISOString()
  await admin
    .from('plan_change_requests')
    .update({
      status: 'draft_ready',
      draft_plan_id: draftId,
      draft_ready_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq('id', requestId)
    .eq('status', 'generating')
}

/** Background processor: in-place edit draft from client lock-in, then queue for coach. */
export async function processPlanChangeRequest(requestId: string): Promise<void> {
  const admin = createAdminClient()
  const request = await claimPlanChangeRequest(admin, requestId)
  if (!request) return

  const claimedStartedAt = request.generation_started_at
  if (!claimedStartedAt) return

  try {
    const [{ data: profile }, { data: activePlan }, { data: latestCheckin }] = await Promise.all([
      admin.from('profiles').select('*').eq('id', request.client_id).single(),
      request.active_plan_id
        ? admin.from('plans').select('*').eq('id', request.active_plan_id).maybeSingle()
        : admin
            .from('plans')
            .select('*')
            .eq('client_id', request.client_id)
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
      admin
        .from('checkins')
        .select('*')
        .eq('client_id', request.client_id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (!profile) throw new Error('Client profile not found')
    const active = (activePlan as Plan | null) ?? null
    if (!active) throw new Error('No active plan to edit')
    const checkin = (latestCheckin as Checkin | null) ?? null
    const clientJourney = await loadClientJourneySnapshot(admin, {
      clientId: request.client_id,
      profile: profile as OnboardingProfile,
      currentCheckin: checkin,
    })

    // Use the in-place section editor — NOT review_update_* weekly generators.
    // Weekly prompts made the model invent "next week" programs for small edit requests.
    const dayHint =
      checkin?.coaching_day != null
        ? `Client coaching day on file: ${checkin.coaching_day}. Still editing the CURRENT plan — do not advance the week.`
        : 'Client may still be on early coaching days. Edit the CURRENT plan only.'

    const profileTyped = profile as OnboardingProfile
    const calorieFormula = formatCalorieGuidanceBlock(profileTyped)

    const coachNote = [
      FRESH_PLAN_OUTPUT_RULES,
      CLIENT_PLAN_EDIT_WEEK_RULES,
      dayHint,
      calorieFormula,
      'Apply the client request when rewriting — do not mention the request or edits in client-facing plan text.',
      'If they did not mention calories, macros, deficit, or surplus, keep a similar daily calorie average unless the request requires otherwise.',
      'If they mention a plateau or not losing weight, raise steps/training — do NOT cut calories.',
      SAFE_RATE_OF_CHANGE_RULE,
      clientJourney?.trim() ? `Client journey:\n${clientJourney.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const metaNotes = encodePlanMeta(
      {
        generatedBy: 'ai',
        source: 'client_plan_change',
      },
      [
        'Client requested edits (locked in). Review carefully before delivering.',
        planChangeRequestMarker(request.id),
        `Scope: ${request.scope}`,
        `Request:\n${request.request_text}`,
      ].join('\n\n')
    )

    const draftId = await reservePlanChangeDraft(admin, request, active, metaNotes ?? '')

    const nutritionPlan = active.nutrition_plan?.trim() || ''
    const workoutPlan = active.workout_plan?.trim() || ''

    const edited = await editPlanForClientChange({
      scope: request.scope,
      nutritionText: nutritionPlan,
      workoutText: workoutPlan,
      clientRequest: request.request_text,
      coachNote,
      clientName: profileTyped.name,
      clientId: request.client_id,
      profile: profileTyped,
    })

    if (request.scope === 'diet' || request.scope === 'both') {
      logNearCopyWarning(
        'nutrition',
        planTextSimilarity(nutritionPlan, edited.nutritionPlan),
        request.id
      )
    }
    if (request.scope === 'workout' || request.scope === 'both') {
      logNearCopyWarning(
        'workout',
        planTextSimilarity(workoutPlan, edited.workoutPlan),
        request.id
      )
    }

    const merged: PlanFormData = {
      client_id: request.client_id,
      title: 'AI Draft · Client request',
      phase: active.phase ?? '',
      nutrition_plan:
        request.scope === 'workout' ? nutritionPlan : edited.nutritionPlan,
      workout_plan:
        request.scope === 'diet' ? workoutPlan : edited.workoutPlan,
      cardio_plan: active.cardio_plan?.trim() || '',
      supplement_plan: active.supplement_plan?.trim() || '',
      coach_notes: metaNotes ?? '',
    }

    const { data: lease } = await admin
      .from('plan_change_requests')
      .select('status, generation_started_at, draft_plan_id')
      .eq('id', request.id)
      .maybeSingle()
    if (
      !lease ||
      !stillOwnsPlanChangeClaim(
        {
          status: lease.status,
          generation_started_at: lease.generation_started_at,
        },
        claimedStartedAt
      )
    ) {
      return
    }

    const reuseDraft = { id: draftId }

    const form = { ...merged, coach_notes: metaNotes ?? '' }
    const saved = await updateAiPlanDraft(admin, reuseDraft.id, form, 'AI Draft · Client request')

    if (saved.error || !saved.data) throw new Error(saved.error ?? 'Failed to save draft')

    await markPlanChangeDraftReady(admin, request.id, saved.data.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error('[plan-change] process failed', requestId, message)
    const { data: lease } = await admin
      .from('plan_change_requests')
      .select('status, generation_started_at')
      .eq('id', requestId)
      .maybeSingle()
    if (
      !lease ||
      !stillOwnsPlanChangeClaim(
        {
          status: lease.status,
          generation_started_at: lease.generation_started_at,
        },
        claimedStartedAt
      )
    ) {
      return
    }
    await admin
      .from('plan_change_requests')
      .update({
        status: 'failed',
        error_message: message.slice(0, 500),
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'generating')
      .eq('generation_started_at', claimedStartedAt)
  }
}
