import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findAiDraftForCheckin, generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { sendCheckinAutoReply } from '@/lib/checkin-auto-reply'
import { computeAutoReplyAt } from '@/lib/checkin-auto-reply-schedule'
import {
  AUTO_DELIVERY_COACH_IDS,
  PIYUSH_COACH_ID,
  autoCoachFirstName,
  shouldAutoProcessCoachWorkQueue,
} from '@/lib/coach-delivery-policy'
import { getCoachWorkQueue, type WorkQueueTask } from '@/lib/coach-work-queue'
import { processPlanChangeRequest } from '@/lib/plan-change-requests'
import { fetchCapturedPlanSlug, shouldAutoGenerateWeeklyPlanDraft } from '@/lib/plan-update-cadence'
import { activatePlan } from '@/lib/plans'
import { autoReplyUnreadChat } from '@/lib/piyush-chat-auto'
import { runPiyushInitialPlanForClient } from '@/lib/piyush-initial-plan-auto'
import { sendChatMessage, getOrCreateConversation, markConversationRead } from '@/lib/coach-chat'
import type { Checkin } from '@/types/database'

export type AutoCoachQueueTaskResult = {
  taskId: string
  type: WorkQueueTask['type']
  clientName?: string
  coachId?: string
  status: 'sent' | 'skipped' | 'failed' | 'left_for_coach'
  detail: string
}

export type AutoCoachQueueSweepSummary = {
  due: number
  sent: number
  skipped: number
  failed: number
  leftForCoach: number
  results: AutoCoachQueueTaskResult[]
}

export type PiyushQueueTaskResult = AutoCoachQueueTaskResult
export type PiyushQueueSweepSummary = AutoCoachQueueSweepSummary

function emptySummary(): AutoCoachQueueSweepSummary {
  return { due: 0, sent: 0, skipped: 0, failed: 0, leftForCoach: 0, results: [] }
}

function pushResult(summary: AutoCoachQueueSweepSummary, result: AutoCoachQueueTaskResult) {
  summary.results.push(result)
  if (result.status === 'sent') summary.sent += 1
  else if (result.status === 'skipped') summary.skipped += 1
  else if (result.status === 'failed') summary.failed += 1
  else summary.leftForCoach += 1
}

async function recordCompletion(
  admin: SupabaseClient,
  coachId: string,
  task: WorkQueueTask
): Promise<void> {
  const { error } = await admin.from('coach_work_queue_completions').upsert(
    {
      coach_id: coachId,
      task_id: task.id,
      task_type: task.type,
      task_created_at: task.createdAt,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'coach_id,task_id' }
  )
  if (error) console.error('[auto-coach-work-queue] completion upsert failed', error.message)
}

async function loadCoach(
  admin: SupabaseClient,
  coachId: string
): Promise<{ userId: string; firstName: string } | null> {
  const { data } = await admin
    .from('coaches')
    .select('user_id, name')
    .eq('id', coachId)
    .maybeSingle()
  if (!data?.user_id) return null
  const firstName = data.name?.trim().split(/\s+/)[0] || autoCoachFirstName(coachId)
  return { userId: data.user_id, firstName }
}

async function scheduleAutoReply(admin: SupabaseClient, checkin: Checkin): Promise<void> {
  if (checkin.auto_reply_at) return
  const due = computeAutoReplyAt(checkin.submitted_at)
  const when = due.getTime() <= Date.now() ? new Date() : due
  await admin.from('checkins').update({ auto_reply_at: when.toISOString() }).eq('id', checkin.id)
}

async function handleCheckin(
  admin: SupabaseClient,
  task: WorkQueueTask,
  options: { ignoreCheckinDelay: boolean }
): Promise<PiyushQueueTaskResult> {
  const checkinId = task.id.replace(/^checkin-/, '')
  const { data: checkin, error } = await admin.from('checkins').select('*').eq('id', checkinId).maybeSingle()
  if (error || !checkin) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: error?.message ?? 'check-in not found',
    }
  }

  const typed = checkin as Checkin

  if (typed.checkin_type === 'weekly') {
    const planSlug = await fetchCapturedPlanSlug(typed.client_id)
    const week = typed.coaching_week ?? 0
    if (shouldAutoGenerateWeeklyPlanDraft(planSlug, week)) {
      const existing = await findAiDraftForCheckin(admin, typed.client_id, typed.id)
      if (!existing) {
        const generated = await generateWeeklyPlanDraft({
          clientId: typed.client_id,
          coachId: typed.coach_id,
          checkinId: typed.id,
          coachingWeek: week,
          trigger: 'auto',
        })
        if (generated.error) {
          return {
            taskId: task.id,
            type: task.type,
            clientName: task.clientName,
            status: 'failed',
            detail: generated.error,
          }
        }
      }
    }
  }

  await scheduleAutoReply(admin, typed)

  const outcome = await sendCheckinAutoReply(admin, typed, {
    ignoreMinDelay: options.ignoreCheckinDelay,
  })
  if (outcome.status === 'sent') {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'sent',
      detail: outcome.publishedPlanId ? `replied plan=${outcome.publishedPlanId}` : 'replied',
    }
  }
  if (outcome.status === 'skipped' && outcome.reason === 'min_delay_not_met') {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'skipped',
      detail: 'waiting for auto-reply window',
    }
  }
  return {
    taskId: task.id,
    type: task.type,
    clientName: task.clientName,
    status: outcome.status === 'skipped' ? 'skipped' : 'failed',
    detail: outcome.reason,
  }
}

async function handlePlanChange(
  admin: SupabaseClient,
  coachId: string,
  task: WorkQueueTask
): Promise<AutoCoachQueueTaskResult> {
  const requestId = task.id.replace(/^plan-change-/, '')
  const { data: existing, error } = await admin
    .from('plan_change_requests')
    .select('id, status, draft_plan_id, client_id')
    .eq('id', requestId)
    .maybeSingle()
  if (error || !existing) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: error?.message ?? 'plan change not found',
    }
  }

  if (existing.status === 'generating' || (!existing.draft_plan_id && existing.status !== 'failed')) {
    try {
      await processPlanChangeRequest(requestId)
    } catch (err) {
      return {
        taskId: task.id,
        type: task.type,
        clientName: task.clientName,
        status: 'failed',
        detail: err instanceof Error ? err.message : 'plan change generate failed',
      }
    }
  }

  const { data: fresh } = await admin
    .from('plan_change_requests')
    .select('id, status, draft_plan_id, client_id')
    .eq('id', requestId)
    .maybeSingle()
  if (!fresh?.draft_plan_id) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: `no draft (${fresh?.status ?? existing.status})`,
    }
  }

  const { data: draft } = await admin
    .from('plans')
    .select('id, client_id, coach_id, nutrition_plan, workout_plan, delivered_at, active')
    .eq('id', fresh.draft_plan_id)
    .maybeSingle()
  if (!draft?.nutrition_plan?.trim() && !draft?.workout_plan?.trim()) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: 'draft empty',
    }
  }
  if (draft.active && draft.delivered_at) {
    await recordCompletion(admin, coachId, task)
    return { taskId: task.id, type: task.type, clientName: task.clientName, status: 'sent', detail: 'already delivered' }
  }

  const activated = await activatePlan(admin, {
    id: draft.id,
    client_id: draft.client_id,
    coach_id: draft.coach_id ?? coachId,
  })
  if (activated.error) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: activated.error,
    }
  }
  await recordCompletion(admin, coachId, task)
  return { taskId: task.id, type: task.type, clientName: task.clientName, status: 'sent', detail: `published ${draft.id}` }
}

async function handleCertificate(
  admin: SupabaseClient,
  coachId: string,
  task: WorkQueueTask,
  coachUserId: string
): Promise<AutoCoachQueueTaskResult> {
  if (!task.clientId) {
    return { taskId: task.id, type: task.type, status: 'failed', detail: 'missing client' }
  }
  const { data: conversation, error } = await getOrCreateConversation(admin, task.clientId)
  if (error || !conversation) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: error ?? 'could not open chat',
    }
  }

  const name = task.clientName?.trim() || 'there'
  const body = [
    `Hi ${name}, you finished in the top 10% of last month's Consistency League.`,
    task.subtitle ? `This is your virtual certificate: ${task.subtitle}.` : 'This is your virtual certificate.',
    'Keep showing up. Your next month starts from today.',
  ].join('\n\n')

  const sent = await sendChatMessage(admin, {
    conversationId: conversation.id,
    senderType: 'coach',
    senderId: coachUserId,
    content: body,
  })
  if (sent.error) {
    return {
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      status: 'failed',
      detail: sent.error,
    }
  }
  await recordCompletion(admin, coachId, task)
  return {
    taskId: task.id,
    type: task.type,
    clientName: task.clientName,
    status: 'sent',
    detail: 'certificate sent in chat',
  }
}

async function handleIssue(
  admin: SupabaseClient,
  coachId: string,
  task: WorkQueueTask
): Promise<AutoCoachQueueTaskResult> {
  const issueId = task.id.replace(/^issue-/, '')
  const { data: issue } = await admin
    .from('issue_reports')
    .select('id, category, status')
    .eq('id', issueId)
    .maybeSingle()

  const planRelated = issue?.category === 'plan_review' || issue?.category === 'plan_complaint'
  if (planRelated && issue?.status && !['resolved', 'closed'].includes(issue.status)) {
    const now = new Date().toISOString()
    await admin
      .from('issue_reports')
      .update({
        status: 'resolved',
        resolved_at: now,
        updated_at: now,
        admin_notes:
          'Auto-resolved from the coaching queue. Plan updates ship from weekly check-ins / plan edits.',
      })
      .eq('id', issueId)
  }

  await recordCompletion(admin, coachId, task)
  return {
    taskId: task.id,
    type: task.type,
    clientName: task.clientName,
    status: 'sent',
    detail: planRelated ? 'plan issue closed' : 'hidden from coach queue (admin still owns it)',
  }
}

type AutoCoachQueueOptions = {
  chatLimit?: number
  checkinLimit?: number
  planChangeLimit?: number
  certificateLimit?: number
  issueLimit?: number
  initialPlanLimit?: number
  ignoreCheckinDelay?: boolean
}

export async function processCoachWorkQueue(
  admin: SupabaseClient,
  coachId: string,
  options?: AutoCoachQueueOptions
): Promise<AutoCoachQueueSweepSummary> {
  if (!shouldAutoProcessCoachWorkQueue(coachId)) return emptySummary()

  const summary = emptySummary()
  const tasks = await getCoachWorkQueue(admin, coachId)
  summary.due = tasks.length

  const coach = await loadCoach(admin, coachId)
  if (!coach) {
    summary.failed = tasks.length
    summary.results = tasks.map((task) => ({
      taskId: task.id,
      type: task.type,
      clientName: task.clientName,
      coachId,
      status: 'failed' as const,
      detail: 'Coach user_id missing',
    }))
    return summary
  }

  const limits = {
    chat: options?.chatLimit ?? 8,
    checkin: options?.checkinLimit ?? 2,
    planChange: options?.planChangeLimit ?? 3,
    certificate: options?.certificateLimit ?? 10,
    issue: options?.issueLimit ?? 20,
    initial: options?.initialPlanLimit ?? 2,
  }
  const used = { chat: 0, checkin: 0, planChange: 0, certificate: 0, issue: 0, initial: 0 }
  const ignoreCheckinDelay = options?.ignoreCheckinDelay === true

  for (const task of tasks) {
    try {
      if (task.type === 'call_request') {
        pushResult(summary, {
          taskId: task.id,
          type: task.type,
          clientName: task.clientName,
          coachId,
          status: 'left_for_coach',
          detail: 'Phone call — AI cannot place the call',
        })
        continue
      }

      if (task.type === 'unread_chat') {
        if (used.chat >= limits.chat) continue
        used.chat += 1
        const conversationId = task.id.replace(/^chat-/, '')
        const reply = await autoReplyUnreadChat(admin, {
          conversationId,
          clientId: task.clientId ?? '',
          coachUserId: coach.userId,
          coachId,
          coachFirstName: coach.firstName,
        })
        if (reply.status === 'skipped' && reply.detail === 'needs_human') {
          pushResult(summary, {
            taskId: task.id,
            type: task.type,
            clientName: task.clientName,
            coachId,
            status: 'left_for_coach',
            detail: 'Client asked for a human (call, refund, or emergency)',
          })
          continue
        }
        if (reply.status === 'sent') {
          const { data: unread } = await admin
            .from('conversation_messages')
            .select('created_at')
            .eq('conversation_id', conversationId)
            .eq('sender_type', 'client')
            .is('read_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
          const readThrough = unread?.[0]?.created_at ?? null
          if (readThrough) await markConversationRead(admin, conversationId, 'coach', readThrough)
          await recordCompletion(admin, coachId, task)
        }
        pushResult(summary, {
          taskId: task.id,
          type: task.type,
          clientName: task.clientName,
          coachId,
          status: reply.status,
          detail: reply.detail,
        })
        continue
      }

      if (task.type === 'checkin_review') {
        if (used.checkin >= limits.checkin) continue
        used.checkin += 1
        const result = await handleCheckin(admin, task, { ignoreCheckinDelay })
        pushResult(summary, { ...result, coachId })
        continue
      }

      if (task.type === 'plan_change_request') {
        if (used.planChange >= limits.planChange) continue
        used.planChange += 1
        pushResult(summary, { ...(await handlePlanChange(admin, coachId, task)), coachId })
        continue
      }

      if (task.type === 'league_certificate') {
        if (used.certificate >= limits.certificate) continue
        used.certificate += 1
        pushResult(summary, {
          ...(await handleCertificate(admin, coachId, task, coach.userId)),
          coachId,
        })
        continue
      }

      if (task.type === 'issue_report') {
        if (used.issue >= limits.issue) continue
        used.issue += 1
        pushResult(summary, { ...(await handleIssue(admin, coachId, task)), coachId })
        continue
      }

      if (task.type === 'initial_plan' || task.type === 'journey_setup') {
        if (used.initial >= limits.initial) continue
        used.initial += 1
        if (!task.clientId) {
          pushResult(summary, {
            taskId: task.id,
            type: task.type,
            coachId,
            status: 'failed',
            detail: 'missing client',
          })
          continue
        }
        const delivered = await runPiyushInitialPlanForClient(admin, task.clientId)
        pushResult(summary, {
          taskId: task.id,
          type: task.type,
          clientName: task.clientName,
          coachId,
          status:
            delivered.status === 'sent'
              ? 'sent'
              : delivered.status === 'skipped'
                ? 'skipped'
                : delivered.status === 'generating'
                  ? 'skipped'
                  : 'failed',
          detail: delivered.detail,
        })
        continue
      }

      pushResult(summary, {
        taskId: task.id,
        type: task.type,
        clientName: task.clientName,
        coachId,
        status: 'left_for_coach',
        detail: 'Unhandled task type',
      })
    } catch (err) {
      pushResult(summary, {
        taskId: task.id,
        type: task.type,
        clientName: task.clientName,
        coachId,
        status: 'failed',
        detail: err instanceof Error ? err.message : 'unhandled error',
      })
    }
  }

  return summary
}

export async function processPiyushWorkQueue(
  admin: SupabaseClient,
  options?: AutoCoachQueueOptions
): Promise<AutoCoachQueueSweepSummary> {
  return processCoachWorkQueue(admin, PIYUSH_COACH_ID, options)
}

export async function processAutoCoachWorkQueues(
  admin: SupabaseClient,
  options?: AutoCoachQueueOptions
): Promise<AutoCoachQueueSweepSummary & { byCoach: Record<string, AutoCoachQueueSweepSummary> }> {
  const byCoach: Record<string, AutoCoachQueueSweepSummary> = {}
  const combined = emptySummary()

  for (const coachId of AUTO_DELIVERY_COACH_IDS) {
    const summary = await processCoachWorkQueue(admin, coachId, options)
    byCoach[coachId] = summary
    combined.due += summary.due
    combined.sent += summary.sent
    combined.skipped += summary.skipped
    combined.failed += summary.failed
    combined.leftForCoach += summary.leftForCoach
    combined.results.push(...summary.results)
  }

  return { ...combined, byCoach }
}
