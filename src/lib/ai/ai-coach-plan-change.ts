import 'server-only'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import {
  type PendingPlanChange,
  planChangeChatInstruction,
  isPlanChangeCancel,
  isPlanChangeConfirm,
  stripPlanChangeTrailer,
  wantsPlanChangeAppliedNow,
  withConfirmCue,
} from '@/lib/ai/ai-coach-plan-change-pure'
import { autoAssignCoachToClient } from '@/lib/coach-assignment'
import {
  assertClientCanReceivePlanChanges,
  type EntitlementProfile,
} from '@/lib/entitlements'
import { isDigitalPlanSlug } from '@/lib/payments/plans'
import {
  createLockedPlanChangeRequest,
  getPlanChangeQuota,
  processPlanChangeRequest,
  publishReadyPlanChange,
} from '@/lib/plan-change-requests'
import { createAdminClient } from '@/lib/supabase/admin'

export type { PendingPlanChange }
export {
  isPlanChangeCancel,
  isPlanChangeConfirm,
  planChangeChatInstruction,
  stripPlanChangeTrailer,
  wantsPlanChangeAppliedNow,
  withConfirmCue,
}

function parsePending(raw: unknown): PendingPlanChange | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (
    (row.scope === 'diet' || row.scope === 'workout' || row.scope === 'both') &&
    typeof row.requestText === 'string' &&
    row.requestText.trim().length >= 10
  ) {
    return {
      scope: row.scope,
      requestText: row.requestText.trim().slice(0, 4000),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    }
  }
  return null
}

export async function loadPendingPlanChange(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<PendingPlanChange | null> {
  const { data } = await admin
    .from('ai_coach_memory')
    .select('pending_plan_change')
    .eq('client_id', clientId)
    .maybeSingle()
  return parsePending(data?.pending_plan_change)
}

export async function savePendingPlanChange(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  pending: PendingPlanChange | null
): Promise<void> {
  const { data } = await admin
    .from('ai_coach_memory')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (data) {
    await admin
      .from('ai_coach_memory')
      .update({
        pending_plan_change: pending,
        updated_at: new Date().toISOString(),
      })
      .eq('client_id', clientId)
    return
  }
  await admin.from('ai_coach_memory').insert({
    client_id: clientId,
    summary: '',
    mood: 'plain',
    pending_plan_change: pending,
  })
}

export async function extractPlanChangeProposal(input: {
  clientText: string
  transcript: string
}): Promise<PendingPlanChange | null> {
  try {
    const result = await generateOpenAIResponse({
      systemPrompt: [
        'Extract a written plan-edit request for a fitness coaching app.',
        'Return JSON only: {"action":"propose"|"none","scope":"diet"|"workout"|"both","requestText":"..."}',
        'Use propose only if they want the saved written diet/workout changed, not a one-meal swap.',
        'requestText must be at least 10 characters and describe the full edit.',
      ].join(' '),
      userPrompt: `${input.transcript}\n\nLatest client message:\n${input.clientText}`,
      model: MODELS.GPT_LUNA,
      maxTokens: 400,
      temperature: 0.2,
    })
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as {
      action?: string
      scope?: string
      requestText?: string
    }
    if (
      parsed.action !== 'propose' ||
      (parsed.scope !== 'diet' && parsed.scope !== 'workout' && parsed.scope !== 'both') ||
      typeof parsed.requestText !== 'string' ||
      parsed.requestText.trim().length < 10
    ) {
      return null
    }
    return {
      scope: parsed.scope,
      requestText: parsed.requestText.trim().slice(0, 4000),
      createdAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function lockAndProcessPlanChangeFromChat(input: {
  clientId: string
  profile: {
    coach_id?: string | null
    plan_delivered?: boolean | null
    role?: string | null
    payment_confirmed?: boolean | null
    access_source?: string | null
    subscription_expires_at?: string | null
  }
  pending: PendingPlanChange
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (input.profile.role && input.profile.role !== 'client') {
    return { ok: false, message: 'Only clients can lock plan edits.' }
  }
  if (!input.profile.plan_delivered) {
    return {
      ok: false,
      message: 'Your first plan is still being prepared. I can lock edits after it arrives.',
    }
  }

  const window = assertClientCanReceivePlanChanges(input.profile as EntitlementProfile)
  if (!window.ok) {
    return {
      ok: false,
      message: 'Your subscription has ended. Renew before I can update the written plan.',
    }
  }

  const admin = createAdminClient()
  const { data: purchase } = await admin
    .from('purchases')
    .select('plan_slug')
    .eq('user_id', input.clientId)
    .eq('status', 'captured')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (isDigitalPlanSlug(purchase?.plan_slug)) {
    return {
      ok: false,
      message: 'This product does not use written plan edits from chat. Stick to the plan in My Plan.',
    }
  }

  let coachId = input.profile.coach_id ?? null
  if (!coachId) {
    const assigned = await autoAssignCoachToClient(input.clientId, admin)
    coachId = assigned.coachId
  }
  if (!coachId) {
    return { ok: false, message: 'I could not open a plan edit just now. Try again in a minute.' }
  }

  const { data: activePlan } = await admin
    .from('plans')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!activePlan?.id) {
    return { ok: false, message: 'No active plan found to edit yet.' }
  }

  const created = await createLockedPlanChangeRequest({
    clientId: input.clientId,
    coachId,
    activePlanId: activePlan.id,
    requestText: input.pending.requestText,
    scope: input.pending.scope,
  })
  if (!created.ok) {
    return { ok: false, message: created.error }
  }

  try {
    await processPlanChangeRequest(created.request.id)
    await publishReadyPlanChange(created.request.id)
  } catch (error) {
    console.error('[ai-coach-plan-change] process failed', error)
    return {
      ok: false,
      message:
        'I locked the request, but the rewrite is still running. Open My Plan in a minute to check it.',
    }
  }

  const quota = await getPlanChangeQuota(input.clientId)
  return {
    ok: true,
    message: `Done — I locked that into My Plan and published the update (${input.pending.scope}). You have ${quota.remainingToday} edit${quota.remainingToday === 1 ? '' : 's'} left today. Open My Plan to read it.`,
  }
}
