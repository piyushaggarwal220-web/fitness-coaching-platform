import 'server-only'
import { MODELS } from '@/lib/ai/config'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import {
  OPENAI_BILLING_ALERT_COOLDOWN_MS,
  OPENAI_BILLING_HOLD_MS,
  isOpenAiBillingError,
} from '@/lib/ai/openai-quota'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { sendDirectEmail } from '@/lib/notifications/email-provider'
import { createAdminClient } from '@/lib/supabase/admin'

const PROBE_ACTION = 'openai_quota_probe'
const ALERT_ACTION = 'openai_quota_alert'
const BILLING_VALIDATION = 'openai_billing'

let memoryHoldUntilMs = 0

export function openAiBillingHoldActive(now = Date.now()): boolean {
  return memoryHoldUntilMs > now
}

function rememberHold(untilMs: number) {
  if (untilMs > memoryHoldUntilMs) memoryHoldUntilMs = untilMs
}

async function latestBillingProbeUntil(now: Date): Promise<Date | null> {
  const since = new Date(now.getTime() - OPENAI_BILLING_HOLD_MS).toISOString()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_generation_logs')
    .select('created_at')
    .eq('action', PROBE_ACTION)
    .eq('validation_result', BILLING_VALIDATION)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.created_at) return null
  const until = new Date(new Date(data.created_at).getTime() + OPENAI_BILLING_HOLD_MS)
  if (until.getTime() <= now.getTime()) return null
  return until
}

function opsInbox(): string {
  return process.env.TALK_TO_COACH_NOTIFY_EMAIL?.trim() || 'piyushfitness44@gmail.com'
}

/** Latest billing failure still inside the hold window, or null when generation may proceed. */
export async function openAiBillingHoldUntil(now = new Date()): Promise<Date | null> {
  if (memoryHoldUntilMs > now.getTime()) return new Date(memoryHoldUntilMs)
  const until = await latestBillingProbeUntil(now)
  if (until) rememberHold(until.getTime())
  return until
}

/**
 * Record one billing failure and alert once. Repeat calls inside the hold do not
 * extend it and do not send another email.
 */
export async function recordOpenAiBillingFailure(message: string, waitingCount = 0): Promise<Date> {
  const now = new Date()
  if (memoryHoldUntilMs > now.getTime()) return new Date(memoryHoldUntilMs)

  const existing = await latestBillingProbeUntil(now)
  if (existing) {
    rememberHold(existing.getTime())
    return existing
  }

  // Claim before any further await so parallel generations in this instance stop.
  const until = new Date(now.getTime() + OPENAI_BILLING_HOLD_MS)
  rememberHold(until.getTime())

  await logAiGeneration({
    clientId: null,
    coachId: null,
    action: PROBE_ACTION,
    model: MODELS.GPT_LUNA,
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    retryCount: 0,
    validationResult: BILLING_VALIDATION,
    success: false,
    knowledgeRefs: null,
    renderedOutput: { error: message.slice(0, 500), holdUntil: until.toISOString() },
  })

  console.error('[openai-billing] plan generation paused', {
    holdUntil: until.toISOString(),
    waiting: waitingCount,
  })

  await alertOpenAiBillingOnce(message, waitingCount, until)
  return until
}

async function alertOpenAiBillingOnce(message: string, waitingCount: number, until: Date): Promise<void> {
  const since = new Date(Date.now() - OPENAI_BILLING_ALERT_COOLDOWN_MS).toISOString()
  const admin = createAdminClient()
  const { data: prior } = await admin
    .from('ai_generation_logs')
    .select('validation_result')
    .eq('action', ALERT_ACTION)
    .eq('validation_result', 'sent')
    .gte('created_at', since)
    .limit(1)

  if (prior && prior.length > 0) return

  const to = opsInbox()
  const text = [
    'OpenAI refused plan generation because the account has no credits remaining.',
    '',
    'Weekly and mid-week check-in delivery is paused. Waiting check-ins will be tried again in 15 minutes, and they will send on their own once a small credit check succeeds. Full plan generations stay stopped until then.',
    '',
    `Waiting check-ins on this sweep: ${waitingCount}.`,
    `Next attempt: ${until.toISOString()}.`,
    '',
    `Provider message: ${message.slice(0, 400)}`,
    '',
    'Add credits on the OpenAI billing page. No redeploy is required.',
  ].join('\n')

  const sent = await sendDirectEmail({
    to,
    subject: 'LURVOX: plan delivery paused — OpenAI has no credits',
    text,
  })

  await logAiGeneration({
    clientId: null,
    coachId: null,
    action: ALERT_ACTION,
    model: null,
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    retryCount: 0,
    validationResult: sent.ok && !sent.skipped ? 'sent' : sent.skipped ? 'email_skipped' : 'email_failed',
    success: Boolean(sent.ok && !sent.skipped),
    knowledgeRefs: null,
    renderedOutput: { to, error: sent.error ?? null },
  })

  if (!sent.ok || sent.skipped) {
    console.error('[openai-billing] alert email was not sent', {
      skipped: sent.skipped ?? false,
      error: sent.error ?? null,
    })
  }
}

export type OpenAiBillingProbe = 'ok' | 'billing' | 'unavailable'

/** One cheap call. Use this before a sweep that would otherwise start many full plans. */
export async function probeOpenAiBilling(waitingCount = 0): Promise<OpenAiBillingProbe> {
  if (openAiBillingHoldActive()) return 'billing'
  const started = Date.now()
  try {
    await generateOpenAIResponse({
      systemPrompt: 'Reply with the single word pong.',
      userPrompt: 'ping',
      model: MODELS.GPT_LUNA,
      maxTokens: 32,
      temperature: 0,
    })
    return 'ok'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI probe failed'
    if (isOpenAiBillingError(message)) {
      await recordOpenAiBillingFailure(message, waitingCount)
      return 'billing'
    }
    console.warn('[openai-billing] probe unavailable', {
      latencyMs: Date.now() - started,
      message: message.slice(0, 200),
    })
    return 'unavailable'
  }
}
