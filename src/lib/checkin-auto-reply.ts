import type { SupabaseClient } from '@supabase/supabase-js'
import { AUTO_REPLY_MIN_DELAY_MS, computeAutoReplyAt } from '@/lib/checkin-auto-reply-schedule'
import { serializeCoachResponse } from '@/lib/checkin'
import { getCheckinTypeDisplayName } from '@/lib/checkin-schedule'
import { postCoachCheckinFeedbackToChat } from '@/lib/coach-chat'
import { shouldScheduleCheckinAutoReply, coachRequiresManualPlanDelivery } from '@/lib/coach-delivery-policy'
import { hasClientEntitlement } from '@/lib/entitlements'
import { ensureClientCoachMessage } from '@/lib/ai/coach-message'
import { generateMidWeekAnalysis, loadCachedMidWeekPack } from '@/lib/ai/midweek-analysis'
import { OPENAI_BILLING_HOLD_MS } from '@/lib/ai/openai-quota'
import { openAiBillingHoldUntil, probeOpenAiBilling } from '@/lib/ai/openai-quota-guard'
import { seedPlannerCheckin } from '@/lib/ai/client-planner'
import { findAiDraftForCheckin, generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { persistDraftGenerationStarted } from '@/lib/ai/draft-workflow-log'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { fetchCapturedPlanSlug, shouldAutoGenerateWeeklyPlanDraft } from '@/lib/plan-update-cadence'
import { activatePlan } from '@/lib/plans'
import { clientCoachNotes, fallbackPublishCoachNotes } from '@/lib/plan-metadata'
import { coachIdHasClientChat, usesHumanCoach } from '@/lib/coach-service'
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

  if (!draft && checkin.checkin_type === 'weekly') {
    const alreadyPublished = await loadPlanPublishedForCheckin(supabase, checkin)
    if (alreadyPublished) return alreadyPublished

    try {
      await seedPlannerCheckin(supabase, {
        clientId: checkin.client_id,
        coachId: checkin.coach_id,
        checkinId: checkin.id,
      })
    } catch (err) {
      console.error('[checkin-auto-reply] planner seed failed', err)
    }

    const planSlug = await fetchCapturedPlanSlug(checkin.client_id)
    const week = checkin.coaching_week
    const draftExpected =
      typeof week === 'number' && shouldAutoGenerateWeeklyPlanDraft(planSlug, week)
    if (draftExpected) {
      return { error: 'draft_not_ready' }
    }
  }

  if (draft) {
    // Manual-delivery coaches never auto-publish — even if a weekly auto-reply path runs.
    if (coachRequiresManualPlanDelivery(checkin.coach_id)) {
      const message = clientCoachNotes(draft.coach_notes).trim() || fallbackPublishCoachNotes(draft)
      return {
        feedback:
          message ||
          'Thanks for checking in. Your updated plan will appear in My Plan as soon as it’s ready.',
        publishedPlanId: null,
      }
    }

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
  checkin: Checkin,
  options?: { ignoreMinDelay?: boolean }
): Promise<AutoReplyOutcome> {
  if (checkin.reviewed) return { status: 'skipped', reason: 'already_reviewed' }

  // Mid-week answers feed Sunday's next-week plan. Never send an AI reply for them.
  if (checkin.checkin_type === 'mid_week') {
    await supabase.from('checkins').update({ auto_reply_at: null }).eq('id', checkin.id)
    return { status: 'skipped', reason: 'midweek_in_weekly' }
  }

  if (!shouldScheduleCheckinAutoReply(checkin.checkin_type, checkin.coach_id)) {
    await supabase.from('checkins').update({ auto_reply_at: null }).eq('id', checkin.id)
    return { status: 'skipped', reason: 'manual_plan_delivery' }
  }

  const submittedMs = new Date(checkin.submitted_at).getTime()
  if (
    !options?.ignoreMinDelay &&
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

  // Coach-chat clients never receive an AI check-in reply or an AI-published plan.
  // A mid-week check-in is read with the weekly check-in instead of answered on its own.
  if (usesHumanCoach(profile)) {
    await supabase.from('checkins').update({ auto_reply_at: null }).eq('id', checkin.id)
    return {
      status: 'skipped',
      reason: 'coach_writes',
    }
  }

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

  if ('error' in resolved) {
    if (resolved.error === 'draft_not_ready') {
      const billingHoldUntil = await openAiBillingHoldUntil()
      if (billingHoldUntil) {
        await supabase
          .from('checkins')
          .update({ auto_reply_at: billingHoldUntil.toISOString() })
          .eq('id', checkin.id)
        return { status: 'skipped', reason: 'openai_billing_hold' }
      }

      void persistDraftGenerationStarted({
        clientId: checkin.client_id,
        coachId: checkin.coach_id,
        checkinId: checkin.id,
        trigger: 'retry',
      }).catch((err) => console.error('[checkin-auto-reply] draft start log failed:', err))

      void generateWeeklyPlanDraft({
        clientId: checkin.client_id,
        coachId: checkin.coach_id,
        checkinId: checkin.id,
        coachingWeek: typeof checkin.coaching_week === 'number' ? checkin.coaching_week : 1,
        trigger: 'retry',
      }).catch((err) => console.error('[checkin-auto-reply] draft regenerate failed:', err))

      const nextAt = new Date(Date.now() + 2 * 60 * 1000).toISOString()
      await supabase.from('checkins').update({ auto_reply_at: nextAt }).eq('id', checkin.id)
      return { status: 'skipped', reason: 'draft_not_ready' }
    }
    return { status: 'failed', reason: resolved.error }
  }

  const response: CoachCheckinResponse = { feedback: resolved.feedback, action_items: '' }
  const now = new Date().toISOString()

  // Publishing the plan marks the check-in reviewed before this claim runs. Lock on the
  // reply itself so that publish cannot swallow the client message.
  const { data: claimed, error: claimError } = await supabase
    .from('checkins')
    .update({
      coach_response: serializeCoachResponse(response),
      reviewed: true,
      reviewed_at: checkin.reviewed_at ?? now,
      auto_replied_at: now,
    })
    .eq('id', checkin.id)
    .is('auto_replied_at', null)
    .is('coach_response', null)
    .select('id')
    .maybeSingle()

  if (claimError) return { status: 'failed', reason: claimError.message }
  if (!claimed) return { status: 'skipped', reason: 'claimed_elsewhere' }

  await supabase.from('profiles').update({ checkin_awaiting: false }).eq('id', checkin.client_id)

  const checkinType = checkin.checkin_type === 'mid_week' ? 'mid_week' : 'weekly'
  const canChat = coachIdHasClientChat(coach.id)
  const chatResult = canChat
    ? await postCoachCheckinFeedbackToChat({
        clientId: checkin.client_id,
        coachId: coach.id,
        coachUserId: coach.user_id,
        checkinType,
        coachingWeek: checkin.coaching_week,
        feedback: resolved.feedback,
        actionItems: '',
      })
    : { conversationId: null as string | null, error: null as string | null }

  if (chatResult.error) {
    console.error('[checkin-auto-reply] chat post failed:', chatResult.error)
  }

  const snippet = resolved.feedback.slice(0, 100)
  await sendNotification({
    userId: checkin.client_id,
    type: 'coach_replied',
    title: `${getCheckinTypeDisplayName(checkinType)} feedback`,
    body: snippet || 'Your coach has reviewed your check-in.',
    actionUrl: chatResult.conversationId ? '/client/chat' : checkinType === 'weekly' ? '/plan' : '/dashboard',
    metadata: {
      checkinId: checkin.id,
      conversationId: chatResult.conversationId,
      messageSnippet: snippet,
      automated: true,
    },
    idempotencyKey: `checkin-review:${checkin.id}`,
  })

  if (resolved.publishedPlanId) {
    await sendNotification({
      userId: checkin.client_id,
      type: 'plan_delivered',
      title: 'Your updated plan is ready',
      body: 'Your diet and workout for this week are in My Plan.',
      actionUrl: '/plan',
      metadata: { checkinId: checkin.id, planId: resolved.publishedPlanId, automated: true },
      idempotencyKey: `weekly-plan-notice:${checkin.id}`,
    })
  }

  return { status: 'sent', publishedPlanId: resolved.publishedPlanId }
}

async function scheduleMissingCheckinAutoReplies(
  supabase: SupabaseClient,
  now: Date
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('checkins')
    .select('id, coach_id, checkin_type, submitted_at')
    .eq('reviewed', false)
    .is('auto_replied_at', null)
    .is('auto_reply_at', null)
    .gte('submitted_at', new Date(now.getTime() - MAX_AUTO_REPLY_AGE_MS).toISOString())
    .order('submitted_at', { ascending: true })
    .limit(50)

  if (error || !rows?.length) return

  for (const row of rows) {
    const checkinType = row.checkin_type === 'mid_week' ? 'mid_week' : 'weekly'
    if (!shouldScheduleCheckinAutoReply(checkinType, row.coach_id)) continue
    const due = computeAutoReplyAt(row.submitted_at)
    const when = due.getTime() <= now.getTime() ? now : due
    await supabase.from('checkins').update({ auto_reply_at: when.toISOString() }).eq('id', row.id)
  }
}

export type AutoReplySweepSummary = {
  due: number
  sent: number
  skipped: number
  failed: number
  deferredForQuietHours: boolean
  billingHold: boolean
  details: { checkinId: string; status: string; reason?: string }[]
}

/** How long a published weekly plan can sit without a client notice before we send one. */
const MISSING_PLAN_NOTICE_AGE_MS = 4 * 24 * 60 * 60 * 1000

/** Active plan already delivered for this check-in. Do not generate another one. */
async function loadPlanPublishedForCheckin(
  supabase: SupabaseClient,
  checkin: Checkin
): Promise<{ feedback: string; publishedPlanId: string } | null> {
  const { data: activePlan } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', checkin.client_id)
    .eq('active', true)
    .maybeSingle()

  const plan = activePlan as Plan | null
  if (!plan?.delivered_at) return null
  const deliveredMs = new Date(plan.delivered_at).getTime()
  const submittedMs = new Date(checkin.submitted_at).getTime()
  if (!Number.isFinite(deliveredMs) || !Number.isFinite(submittedMs) || deliveredMs < submittedMs) {
    return null
  }

  const feedback = clientCoachNotes(plan.coach_notes).trim() || fallbackPublishCoachNotes(plan)
  if (!feedback.trim()) return null
  return { feedback, publishedPlanId: plan.id }
}

/**
 * Plans that published successfully never reached the client when the publish step
 * marked the check-in reviewed before the reply could be claimed. Tell those clients
 * the plan is already in My Plan. Does not generate anything.
 */
async function notifyPlansPublishedWithoutReply(
  supabase: SupabaseClient,
  now: Date
): Promise<void> {
  const since = new Date(now.getTime() - MISSING_PLAN_NOTICE_AGE_MS).toISOString()
  const { data: rows, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('checkin_type', 'weekly')
    .eq('reviewed', true)
    .is('auto_replied_at', null)
    .is('coach_response', null)
    .gte('submitted_at', since)
    .order('submitted_at', { ascending: true })
    .limit(40)

  if (error || !rows?.length) {
    if (error) console.error('[checkin-auto-reply] missing plan notice lookup failed:', error.message)
    return
  }

  for (const checkin of rows as Checkin[]) {
    const { data: newer } = await supabase
      .from('checkins')
      .select('id')
      .eq('client_id', checkin.client_id)
      .eq('checkin_type', 'weekly')
      .gt('submitted_at', checkin.submitted_at)
      .limit(1)
    if (newer && newer.length > 0) continue

    const published = await loadPlanPublishedForCheckin(supabase, checkin)
    if (!published) continue

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', checkin.client_id)
      .maybeSingle()
    if (profileRow?.email?.includes('@lurvox.test')) continue

    const { data: coach } = await supabase
      .from('coaches')
      .select('id, user_id')
      .eq('id', checkin.coach_id)
      .maybeSingle()
    if (!coach?.user_id) continue

    const sentAt = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('checkins')
      .update({
        coach_response: serializeCoachResponse({ feedback: published.feedback, action_items: '' }),
        auto_replied_at: sentAt,
      })
      .eq('id', checkin.id)
      .is('auto_replied_at', null)
      .is('coach_response', null)
      .select('id')
      .maybeSingle()

    if (claimError || !claimed) {
      if (claimError) console.error('[checkin-auto-reply] plan notice claim failed:', claimError.message)
      continue
    }

    const chatResult = coachIdHasClientChat(coach.id)
      ? await postCoachCheckinFeedbackToChat({
          clientId: checkin.client_id,
          coachId: coach.id,
          coachUserId: coach.user_id,
          checkinType: 'weekly',
          coachingWeek: checkin.coaching_week,
          feedback: published.feedback,
          actionItems: '',
        })
      : { conversationId: null as string | null, error: null as string | null }
    if (chatResult.error) {
      console.error('[checkin-auto-reply] plan notice chat failed:', chatResult.error)
    }

    await sendNotification({
      userId: checkin.client_id,
      type: 'plan_delivered',
      title: 'Your updated plan is ready',
      body: 'Your diet and workout for this week are in My Plan.',
      actionUrl: '/plan',
      metadata: {
        checkinId: checkin.id,
        planId: published.publishedPlanId,
        conversationId: chatResult.conversationId,
      },
      idempotencyKey: `weekly-plan-notice:${checkin.id}`,
    })
  }
}

/**
 * Send every automated reply that has come due. Driven by a one-minute scheduler so a
 * 26–28 minute plan lands inside that window. Safe to run repeatedly because each row is
 * claimed via a conditional update before anything is sent.
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
    billingHold: false,
    details: [],
  }

  await scheduleMissingCheckinAutoReplies(supabase, now)

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

  const dueRows = (rows ?? []) as Checkin[]
  const summary: AutoReplySweepSummary = { ...empty, due: dueRows.length }

  if (dueRows.length > 0) {
    let holdUntil = await openAiBillingHoldUntil(now)
    if (!holdUntil) {
      const probe = await probeOpenAiBilling(dueRows.length).catch((err) => {
        console.error('[checkin-auto-reply] billing probe failed:', err)
        return 'unavailable' as const
      })
      if (probe === 'billing') {
        holdUntil = (await openAiBillingHoldUntil(now)) ?? new Date(now.getTime() + OPENAI_BILLING_HOLD_MS)
      }
    }
    if (holdUntil) {
      const { error: holdError } = await supabase
        .from('checkins')
        .update({ auto_reply_at: holdUntil.toISOString() })
        .in(
          'id',
          dueRows.map((row) => row.id)
        )
      if (holdError) throw new Error(holdError.message)
      summary.billingHold = true
      summary.skipped = dueRows.length
      summary.details = dueRows.map((row) => ({
        checkinId: row.id,
        status: 'skipped',
        reason: 'openai_billing_hold',
      }))
      await notifyPlansPublishedWithoutReply(supabase, now)
      return summary
    }
  }

  for (const row of dueRows) {
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

  await notifyPlansPublishedWithoutReply(supabase, now)

  return summary
}
