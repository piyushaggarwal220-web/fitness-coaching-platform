import type { SupabaseClient } from '@supabase/supabase-js'
import { serializeCoachResponse } from '@/lib/checkin'
import { markConversationRead } from '@/lib/coach-chat'
import type { WorkQueueTask } from '@/lib/coach-work-queue'

export type ResolveWorkQueueResult = {
  ok: boolean
  error?: string
  /** Task left the queue on the server; safe to drop from UI permanently. */
  resolved: boolean
}

/**
 * Persist "Complete" against the underlying record so realtime/poll cannot
 * resurrect already-handled work.
 */
export async function resolveWorkQueueTask(
  supabase: SupabaseClient,
  task: WorkQueueTask
): Promise<ResolveWorkQueueResult> {
  switch (task.type) {
    case 'call_request': {
      const requestId = task.id.replace(/^call-/, '')
      const res = await fetch('/api/chat/call-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status: 'completed' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, resolved: false, error: body?.error ?? 'Could not complete call request.' }
      }
      return { ok: true, resolved: true }
    }

    case 'unread_chat': {
      const conversationId = task.id.replace(/^chat-/, '')
      const { data: unread } = await supabase
        .from('conversation_messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'client')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)

      const readThrough = unread?.[0]?.created_at ?? null
      if (readThrough) {
        await markConversationRead(supabase, conversationId, 'coach', readThrough)
      }

      const { error } = await supabase
        .from('coach_conversations')
        .update({ unread_by_coach: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      if (error) {
        return { ok: false, resolved: false, error: error.message }
      }
      return { ok: true, resolved: true }
    }

    case 'checkin_review': {
      const checkinId = task.id.replace(/^checkin-/, '')
      const { data: checkin, error: loadError } = await supabase
        .from('checkins')
        .select('id, client_id, reviewed, coach_response')
        .eq('id', checkinId)
        .maybeSingle()

      if (loadError || !checkin) {
        return { ok: false, resolved: false, error: loadError?.message ?? 'Check-in not found.' }
      }
      if (checkin.reviewed) return { ok: true, resolved: true }

      const now = new Date().toISOString()
      const { error } = await supabase
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

      await supabase
        .from('profiles')
        .update({ checkin_awaiting: false })
        .eq('id', checkin.client_id)

      return { ok: true, resolved: true }
    }

    case 'issue_report': {
      const issueId = task.id.replace(/^issue-/, '')
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('issue_reports')
        .update({
          status: 'resolved',
          resolved_at: now,
          updated_at: now,
          admin_notes: 'Resolved from coach work queue.',
        })
        .eq('id', issueId)

      if (error) return { ok: false, resolved: false, error: error.message }
      return { ok: true, resolved: true }
    }

    case 'initial_plan': {
      if (!task.clientId) {
        return { ok: false, resolved: false, error: 'Missing client for plan task.' }
      }
      const { data: plan } = await supabase
        .from('plans')
        .select('id, nutrition_plan, workout_plan, delivered_at')
        .eq('client_id', task.clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const hasContent =
        Boolean(plan?.nutrition_plan?.trim()) && Boolean(plan?.workout_plan?.trim())
      if (!hasContent) {
        return {
          ok: false,
          resolved: false,
          error: 'Plan is not ready yet. Open Start to review or generate it.',
        }
      }

      const now = new Date().toISOString()
      if (plan && !plan.delivered_at) {
        await supabase.from('plans').update({ delivered_at: now }).eq('id', plan.id)
      }
      const { error } = await supabase
        .from('profiles')
        .update({ plan_delivered: true })
        .eq('id', task.clientId)

      if (error) return { ok: false, resolved: false, error: error.message }
      return { ok: true, resolved: true }
    }

    case 'plan_change_request': {
      return {
        ok: false,
        resolved: false,
        error: 'Open Start to review and deliver the plan change.',
      }
    }

    default:
      return { ok: false, resolved: false, error: 'This task type cannot be completed from the queue.' }
  }
}
