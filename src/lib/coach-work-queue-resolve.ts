import type { SupabaseClient } from '@supabase/supabase-js'
import { serializeCoachResponse } from '@/lib/checkin'
import { markConversationRead } from '@/lib/coach-chat'
import type { WorkQueueTask } from '@/lib/coach-work-queue'
import { activatePlan, syncPlanDeliveredFlag } from '@/lib/plans'

export type ResolveWorkQueueResult = {
  ok: boolean
  error?: string
  /** Task left the queue on the server; safe to drop from UI permanently. */
  resolved: boolean
}

/**
 * Persist "Complete" against the underlying record so realtime/poll cannot
 * resurrect already-handled work. Call with a service-role client.
 */
export async function resolveWorkQueueTask(
  admin: SupabaseClient,
  task: WorkQueueTask,
  coachId: string
): Promise<ResolveWorkQueueResult> {
  switch (task.type) {
    case 'call_request': {
      const requestId = task.id.replace(/^call-/, '')
      const now = new Date().toISOString()
      const { data: existing, error: loadError } = await admin
        .from('call_requests')
        .select('id, coach_id, status')
        .eq('id', requestId)
        .maybeSingle()

      if (loadError || !existing) {
        return { ok: false, resolved: false, error: loadError?.message ?? 'Call request not found.' }
      }
      if (existing.coach_id !== coachId) {
        return { ok: false, resolved: false, error: 'Call request is not assigned to you.' }
      }
      if (existing.status === 'completed') return { ok: true, resolved: true }

      const { error } = await admin
        .from('call_requests')
        .update({ status: 'completed', resolved_at: now, updated_at: now })
        .eq('id', requestId)
        .eq('coach_id', coachId)

      if (error) return { ok: false, resolved: false, error: error.message }
      return { ok: true, resolved: true }
    }

    case 'unread_chat': {
      const conversationId = task.id.replace(/^chat-/, '')
      const { data: conversation, error: convError } = await admin
        .from('coach_conversations')
        .select('id, coach_id')
        .eq('id', conversationId)
        .maybeSingle()

      if (convError || !conversation) {
        return { ok: false, resolved: false, error: convError?.message ?? 'Conversation not found.' }
      }
      if (conversation.coach_id !== coachId) {
        return { ok: false, resolved: false, error: 'Conversation is not assigned to you.' }
      }

      const { data: unread } = await admin
        .from('conversation_messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'client')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)

      const readThrough = unread?.[0]?.created_at ?? null
      if (readThrough) {
        const mark = await markConversationRead(admin, conversationId, 'coach', readThrough)
        if (mark.error) {
          return { ok: false, resolved: false, error: mark.error.message }
        }
      }

      const { count, error: countError } = await admin
        .from('conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'client')
        .is('read_at', null)

      if (countError) {
        return { ok: false, resolved: false, error: countError.message }
      }

      const remainingUnread = count ?? 0
      const { error } = await admin
        .from('coach_conversations')
        .update({
          unread_by_coach: remainingUnread,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('coach_id', coachId)

      if (error) return { ok: false, resolved: false, error: error.message }
      if (remainingUnread > 0) {
        return {
          ok: false,
          resolved: false,
          error: 'Unread messages are still open. Open the chat and try Completed again.',
        }
      }
      return { ok: true, resolved: true }
    }

    case 'checkin_review': {
      const checkinId = task.id.replace(/^checkin-/, '')
      const { data: checkin, error: loadError } = await admin
        .from('checkins')
        .select('id, client_id, reviewed, coach_response, coach_id')
        .eq('id', checkinId)
        .maybeSingle()

      if (loadError || !checkin) {
        return { ok: false, resolved: false, error: loadError?.message ?? 'Check-in not found.' }
      }
      if (checkin.coach_id && checkin.coach_id !== coachId) {
        return { ok: false, resolved: false, error: 'Check-in is not assigned to you.' }
      }
      if (checkin.reviewed) return { ok: true, resolved: true }

      const now = new Date().toISOString()
      const { error } = await admin
        .from('checkins')
        .update({
          reviewed: true,
          reviewed_at: now,
          coach_response:
            typeof checkin.coach_response === 'string' && checkin.coach_response.trim()
              ? checkin.coach_response
              : serializeCoachResponse({
                  feedback:
                    'Reviewed from work queue. Open the check-in if you need to add detailed notes.',
                  action_items: '',
                }),
        })
        .eq('id', checkinId)

      if (error) return { ok: false, resolved: false, error: error.message }

      await admin
        .from('profiles')
        .update({ checkin_awaiting: false })
        .eq('id', checkin.client_id)

      return { ok: true, resolved: true }
    }

    case 'issue_report': {
      const issueId = task.id.replace(/^issue-/, '')
      const { data: issue, error: issueError } = await admin
        .from('issue_reports')
        .select('id, client_id')
        .eq('id', issueId)
        .maybeSingle()

      if (issueError || !issue) {
        return { ok: false, resolved: false, error: issueError?.message ?? 'Issue report not found.' }
      }

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('coach_id')
        .eq('id', issue.client_id)
        .maybeSingle()

      if (profileError || !profile || profile.coach_id !== coachId) {
        return {
          ok: false,
          resolved: false,
          error: profileError?.message ?? 'Issue report is not assigned to you.',
        }
      }

      const now = new Date().toISOString()
      const { error } = await admin
        .from('issue_reports')
        .update({
          status: 'resolved',
          resolved_at: now,
          updated_at: now,
          admin_notes: 'Resolved from coach work queue.',
        })
        .eq('id', issueId)
        .eq('client_id', issue.client_id)

      if (error) return { ok: false, resolved: false, error: error.message }
      return { ok: true, resolved: true }
    }

    case 'initial_plan': {
      if (!task.clientId) {
        return { ok: false, resolved: false, error: 'Missing client for plan task.' }
      }

      const { data: profile } = await admin
        .from('profiles')
        .select('id, coach_id')
        .eq('id', task.clientId)
        .maybeSingle()

      if (!profile || profile.coach_id !== coachId) {
        return { ok: false, resolved: false, error: 'Client is not assigned to you.' }
      }

      const { data: activePlan } = await admin
        .from('plans')
        .select('id, client_id, coach_id, nutrition_plan, workout_plan, delivered_at, active')
        .eq('client_id', task.clientId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let plan = activePlan
      if (!plan?.nutrition_plan?.trim() || !plan?.workout_plan?.trim()) {
        const { data: latestReady } = await admin
          .from('plans')
          .select('id, client_id, coach_id, nutrition_plan, workout_plan, delivered_at, active')
          .eq('client_id', task.clientId)
          .eq('coach_id', coachId)
          .order('created_at', { ascending: false })
          .limit(20)

        plan =
          (latestReady ?? []).find(
            (row) => Boolean(row.nutrition_plan?.trim()) && Boolean(row.workout_plan?.trim())
          ) ?? null
      }

      if (!plan?.nutrition_plan?.trim() || !plan?.workout_plan?.trim()) {
        return {
          ok: false,
          resolved: false,
          error: 'Plan is not ready yet. Open Start to review or generate it.',
        }
      }

      if (!plan.active || !plan.delivered_at) {
        const { error: activateError } = await activatePlan(admin, {
          id: plan.id,
          client_id: plan.client_id,
          coach_id: plan.coach_id ?? coachId,
        })
        if (activateError) return { ok: false, resolved: false, error: activateError }
      } else {
        const { error: syncError } = await syncPlanDeliveredFlag(admin, task.clientId)
        if (syncError) return { ok: false, resolved: false, error: syncError }
      }

      return { ok: true, resolved: true }
    }

    case 'plan_change_request': {
      const requestId = task.id.replace(/^plan-change-/, '')
      const now = new Date().toISOString()
      const { data: existing, error: loadError } = await admin
        .from('plan_change_requests')
        .select('id, coach_id, client_id, status, draft_plan_id')
        .eq('id', requestId)
        .maybeSingle()

      if (loadError || !existing) {
        return {
          ok: false,
          resolved: false,
          error: loadError?.message ?? 'Plan change request not found.',
        }
      }
      if (existing.coach_id !== coachId) {
        return { ok: false, resolved: false, error: 'Plan change request is not assigned to you.' }
      }
      if (['approved', 'declined', 'cancelled', 'failed'].includes(existing.status)) {
        return { ok: true, resolved: true }
      }

      if (existing.draft_plan_id) {
        const { data: draft } = await admin
          .from('plans')
          .select('id, client_id, coach_id, nutrition_plan, workout_plan, delivered_at, active')
          .eq('id', existing.draft_plan_id)
          .maybeSingle()

        if (draft?.nutrition_plan?.trim() && draft?.workout_plan?.trim()) {
          if (!draft.active || !draft.delivered_at) {
            const { error: activateError } = await activatePlan(admin, {
              id: draft.id,
              client_id: draft.client_id,
              coach_id: draft.coach_id ?? coachId,
            })
            if (activateError) return { ok: false, resolved: false, error: activateError }
          } else {
            await admin
              .from('plan_change_requests')
              .update({ status: 'approved', resolved_at: now, updated_at: now })
              .eq('id', requestId)
              .in('status', ['generating', 'draft_ready', 'in_review'])
          }
          return { ok: true, resolved: true }
        }
      }

      // Coach finished outside the draft flow (or closed while still generating).
      const { error } = await admin
        .from('plan_change_requests')
        .update({
          status: 'cancelled',
          resolved_at: now,
          updated_at: now,
          error_message: 'Closed from coach work queue.',
        })
        .eq('id', requestId)
        .eq('coach_id', coachId)
        .in('status', ['generating', 'draft_ready', 'in_review'])

      if (error) return { ok: false, resolved: false, error: error.message }
      return { ok: true, resolved: true }
    }

    default:
      return { ok: false, resolved: false, error: 'This task type cannot be completed from the queue.' }
  }
}
