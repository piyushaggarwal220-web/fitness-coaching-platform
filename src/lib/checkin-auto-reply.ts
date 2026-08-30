import type { SupabaseClient } from '@supabase/supabase-js'
import { AUTO_REPLY_MIN_DELAY_MS } from '@/lib/checkin-auto-reply-schedule'
import { serializeCoachResponse } from '@/lib/checkin'
import { getCheckinTypeDisplayName } from '@/lib/checkin-schedule'
import { postCoachCheckinFeedbackToChat } from '@/lib/coach-chat'
import { hasClientEntitlement } from '@/lib/entitlements'
import { ensureClientCoachMessage } from '@/lib/ai/coach-message'
import { generateMidWeekAnalysis, loadCachedMidWeekPack } from '@/lib/ai/midweek-analysis'
import { findAiDraftForCheckin } from '@/lib/ai/weekly-plan-draft'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { activatePlan } from '@/lib/plans'
import { clientCoachNotes, fallbackPublishCoachNotes } from '@/lib/plan-metadata'
import type { Checkin, CoachCheckinResponse, OnboardingProfile, Plan } from '@/types/database'

export { isCheckinPendingAutoReply } from '@/lib/checkin-pending-auto-reply'

/** Never auto-reply to a check-in older than this — stale rows are the coach's call. */
const MAX_AUTO_REPLY_AGE_MS = 7 * 24 * 60 * 60 * 1000

type AutoReplyOutcome =
  | { status: 'sent'; publishedPlanId?: string | null }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

/** Build the client-facing reply text for a check-in, publishing the weekly plan when one is ready. */
async function resolveReply(
  supabase: SupabaseClient,
  checkin: Checkin,
  profile: OnboardingProfile
): Promise<{ feedback: string; publishedPlanId: string | null } | { error: string }> {
  if (checkin.checkin_type === 'mid_week') {
    const cached = await loadCachedMidWeekPack(checkin.id)
    const reply =
      cached?.clientReply?.trim() ||
      (
        await generateMidWeekAnalysis({
          profile,
          checkin,
          coachId: checkin.coach_id,
        })
      ).clientReply?.trim()

    if (!reply) return { error: 'no_mid_week_reply' }
    return { feedback: reply, publishedPlanId: null }
  }

  const draft = await findAiDraftForCheckin(supabase, checkin.client_id, checkin.id)

  if (draft) {
    const { error: activateError } = await activatePlan(supabase, {
      id: draft.id,
      client_id: draft.client_id,
      coach_id: draft.coach_id,
    })
    if (activateError) return { error: `publish_failed: ${activateError}` }

    try {
      const { ensureWeeklyCallForClient } = await import('@/lib/weekly-call-schedule')
      await ensureWeeklyCallForClient(supabase, draft.client_id)
    } catch (err) {
      console.error('[checkin-auto-reply] weekly call schedule failed', err)
    }

    const message = clientCoachNotes(draft.coach_notes).trim() || fallbackPublishCoachNotes(draft)
    return { feedback: message, publishedPlanId: draft.id }
  }

  // Off-cadence weeks have no new plan, but the client still gets a real reply.
  const { data: activePlan } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', checkin.client_id)
    .eq('active', true)
    .maybeSingle()

  const message = await ensureClientCoachMessage({
    profile,
    checkin,
    activePlan: (activePlan as Plan | null) ?? null,
  })

  const trimmed = message.trim()
  if (!trimmed) return { error: 'no_weekly_reply' }
  return { feedback: trimmed, publishedPlanId: null }
}

/**
 * Deliver the automated reply for a single check-in, mirroring exactly what the coach review
 * endpoint does: persist the response, clear the awaiting flag, post into chat, notify the client.
 */
export async function sendCheckinAutoReply(
  supabase: SupabaseClient,
  checkin: Checkin
): Promise<AutoReplyOutcome> {
  if (checkin.reviewed) return { status: 'skipped', reason: 'already_reviewed' }

  const submittedMs = new Date(checkin.submitted_at).getTime()
  if (
    Number.isFinite(submittedMs) &&
    Date.now() - submittedMs < AUTO_REPLY_MIN_DELAY_MS
  ) {
    return { status: 'skipped', reason: 'min_delay_not_met' }
  }

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', checkin.client_id)
    .maybeSingle()

  if (!profileRow) return { status: 'skipped', reason: 'profile_missing' }

  const profile = profileRow as OnboardingProfile
  // Ended memberships drop out of the coach queue, so they must not receive automated coaching either.
  if (!hasClientEntitlement(profile)) return { status: 'skipped', reason: 'membership_ended' }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, user_id')
    .eq('id', checkin.coach_id)
    .maybeSingle()

  if (!coach?.user_id) return { status: 'skipped', reason: 'coach_missing' }

  let resolved: Awaited<ReturnType<typeof resolveReply>>
  try {
    resolved = await resolveReply(supabase, checkin, profile)
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : 'reply_generation_failed' }
  }

  if ('error' in resolved) return { status: 'failed', reason: resolved.error }

  const response: CoachCheckinResponse = { feedback: resolved.feedback, action_items: '' }
  const now = new Date().toISOString()

  // Claim the row before sending so a retry or an overlapping sweep cannot double-message.
  const { data: claimed, error: claimError } = await supabase
    .from('checkins')
    .update({
      coach_response: serializeCoachResponse(response),
      reviewed: true,
      reviewed_at: now,
      auto_replied_at: now,
    })
    .eq('id', checkin.id)
    .eq('reviewed', false)
    .select('id')
    .maybeSingle()

  if (claimError) return { status: 'failed', reason: claimError.message }
  if (!claimed) return { status: 'skipped', reason: 'claimed_elsewhere' }

  await supabase.from('profiles').update({ checkin_awaiting: false }).eq('id', checkin.client_id)

  const checkinType = checkin.checkin_type === 'mid_week' ? 'mid_week' : 'weekly'
  const chatResult = await postCoachCheckinFeedbackToChat({
    clientId: checkin.client_id,
    coachId: coach.id,
    coachUserId: coach.user_id,
    checkinType,
    coachingWeek: checkin.coaching_week,
    feedback: resolved.feedback,
    actionItems: '',
  })

  if (chatResult.error) {
    console.error('[checkin-auto-reply] chat post failed:', chatResult.error)
  }

  const snippet = resolved.feedback.slice(0, 100)
  await sendNotification({
    userId: checkin.client_id,
    type: 'coach_replied',
    title: `${getCheckinTypeDisplayName(checkinType)} feedback`,
    body: snippet || 'Your coach has reviewed your check-in.',
    actionUrl: chatResult.conversationId ? '/client/chat' : '/journey',
    metadata: {
      checkinId: checkin.id,
      conversationId: chatResult.conversationId,
      messageSnippet: snippet,
      automated: true,
    },
    idempotencyKey: `checkin-review:${checkin.id}`,
  })

  return { status: 'sent', publishedPlanId: resolved.publishedPlanId }
}

export type AutoReplySweepSummary = {
  due: number
  sent: number
  skipped: number
  failed: number
  deferredForQuietHours: boolean
  details: { checkinId: string; status: string; reason?: string }[]
}

/**
 * Send every automated reply that has come due. Driven by a 15-minute scheduler; safe to run
 * repeatedly because each row is claimed via a conditional update before anything is sent.
 */
export async function processDueCheckinAutoReplies(
  supabase: SupabaseClient,
  options: { now?: Date; limit?: number } = {}
): Promise<AutoReplySweepSummary> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 25
  const empty: AutoReplySweepSummary = {
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    deferredForQuietHours: false,
    details: [],
  }

  const { data: rows, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('reviewed', false)
    .is('auto_replied_at', null)
    .not('auto_reply_at', 'is', null)
    .lte('auto_reply_at', now.toISOString())
    .gte('submitted_at', new Date(now.getTime() - MAX_AUTO_REPLY_AGE_MS).toISOString())
    .order('auto_reply_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)

  const summary: AutoReplySweepSummary = { ...empty, due: (rows ?? []).length }

  for (const row of (rows ?? []) as Checkin[]) {
    const outcome = await sendCheckinAutoReply(supabase, row)
    summary.details.push({
      checkinId: row.id,
      status: outcome.status,
      reason: outcome.status === 'sent' ? undefined : outcome.reason,
    })
    if (outcome.status === 'sent') summary.sent += 1
    else if (outcome.status === 'skipped') summary.skipped += 1
    else summary.failed += 1
  }

  return summary
}
