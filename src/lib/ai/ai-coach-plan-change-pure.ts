export type PlanChangeScope = 'diet' | 'workout' | 'both'

export type PendingPlanChange = {
  scope: PlanChangeScope
  requestText: string
  createdAt: string
}

const TRAILER_RE = /<<<PLAN_CHANGE\s*([\s\S]*?)\s*>>>/i

const CONFIRM_RE =
  /^(?:yes|yeah|yep|yup|ok|okay|sure|do it|go ahead|lock it|lock in|confirm|update (?:my )?plan|haan|haa|bilkul|kar do|karde|please (?:do|update|lock))(?:[.!\s]+(?:please|now|kar do|karde|lock(?: it)?|update))?[.!\s]*$/i

const CANCEL_RE =
  /^(?:no|nope|cancel|never ?mind|leave it|not now|mat karo?|nahi|nahin|na)(?:[.!\s]+(?:thanks|thank you|ok|okay|please|rehne do|chhod do|mat karo?))?[.!\s]*$/i

const PLAN_TOPIC_RE = /\b(workout|workouts|exercise|exercises|diet|meal|meals|split|sets?|plan|food)\b/i
const PLAN_ACTION_RE =
  /\b(remove|hatao|hata\s?do|hatado|replace|instead|skip|avoid|update|change|badal|rewrite|chahiye|kar\s?do|kardo|de\s?do|dedo|banao|bana\s?do|new|naya|nayi|normal|hard|add|include)\b/i

const APPLY_NOW_RE =
  /\b(lock (it |this )?in|update my (written )?plan|change my (written )?(diet|workout|plan)|rewrite my (diet|workout|plan)|apply (this|the) change)\b/i

export function isPlanChangeConfirm(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 80) return false
  return CONFIRM_RE.test(t)
}

export function isPlanChangeCancel(text: string): boolean {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0 || lines.length > 2) return false
  return lines.every((line) => line.length <= 40 && CANCEL_RE.test(line))
}

/** A concrete diet or workout edit, not a bare yes/no. */
export function isSpecificPlanEditRequest(text: string): boolean {
  const t = text.trim()
  if (t.length < 8) return false
  return PLAN_TOPIC_RE.test(t) && PLAN_ACTION_RE.test(t)
}

/** A new edit should replace a YES/NO that is still waiting. */
export function replacesPendingPlanChange(text: string): boolean {
  const t = text.trim()
  if (!t || isPlanChangeConfirm(t) || isPlanChangeCancel(t)) return false
  return isSpecificPlanEditRequest(t)
}

/** A clarifying question is not a lock. Do not attach YES to it. */
export function blocksPlanChangeLock(visible: string): boolean {
  const text = visible.trim()
  if (!text || /\breply\s+yes\b/i.test(text)) return false
  return /\?/.test(text)
}

const SIDE_TOPIC_RE = /\b(call|phone|need to talk|talk to|baat karni|baat kar)\b/i
const YES_PROMPT_RE = /\b(reply\s+yes|yes\s+ya\s+no|yes\s+or\s+no|yes\s+bhejo)\b/i

/** A call or "need to talk" is not an answer to the pending edit. */
export function dropStaleYesPrompt(clientText: string, reply: string): string {
  if (
    replacesPendingPlanChange(clientText) ||
    isPlanChangeConfirm(clientText) ||
    isPlanChangeCancel(clientText) ||
    !SIDE_TOPIC_RE.test(clientText)
  ) {
    return reply
  }
  const kept = reply
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !YES_PROMPT_RE.test(line))
    .join('\n')
    .trim()
  return kept || 'Write the issue here and I will handle it in this chat.'
}

export function pendingPlanChangeDirective(pending: PendingPlanChange): string {
  return [
    'An earlier edit is not locked yet:',
    `Scope: ${pending.scope}`,
    pending.requestText,
    'If their latest message asks for a different diet or workout change, drop that earlier edit and propose only the new one. Do not tell them to answer YES or NO first.',
    'If their latest message is not a plan change, answer that message. Do not ask YES or NO.',
    'Ask YES or NO only when you are still offering this same edit and they have not replaced it.',
  ].join('\n')
}

export function wantsPlanChangeAppliedNow(text: string): boolean {
  return APPLY_NOW_RE.test(text.trim())
}

export function stripPlanChangeTrailer(text: string): {
  visible: string
  propose: PendingPlanChange | null
} {
  const match = text.match(TRAILER_RE)
  if (!match) return { visible: text.trim(), propose: null }
  const visible = text.replace(TRAILER_RE, '').trim()
  try {
    const parsed = JSON.parse(match[1].trim()) as {
      action?: string
      scope?: string
      requestText?: string
    }
    if (
      parsed.action === 'propose' &&
      (parsed.scope === 'diet' || parsed.scope === 'workout' || parsed.scope === 'both') &&
      typeof parsed.requestText === 'string' &&
      parsed.requestText.trim().length >= 10
    ) {
      return {
        visible,
        propose: {
          scope: parsed.scope,
          requestText: parsed.requestText.trim().slice(0, 4000),
          createdAt: new Date().toISOString(),
        },
      }
    }
  } catch {
    // Ignore malformed trailers — show the visible reply only.
  }
  return { visible, propose: null }
}

export function planChangeChatInstruction(remainingToday: number): string {
  return [
    'PLAN EDITS FROM CHAT:',
    'Same-day food or exercise swaps that stay inside today\'s written plan: answer in chat. Do not propose a plan edit.',
    'If they want the written diet or workout rewritten, summarise that edit in one or two lines, then ask them to reply YES to send it to their coach.',
    'Do not ask a question when their message, the injury note, and the current plan already say what to change.',
    'Ask one question only when a required detail is missing, such as which exercise or which meal, and that detail is not in the plan or this chat. Never put that question in the same reply as a YES lock.',
    'If they reject an edit and say what they want instead, propose only the new edit.',
    'A new diet or workout request replaces any older edit that is still waiting. Do not tell them to answer YES or NO on the old one first.',
    `They have ${remainingToday} plan edit${remainingToday === 1 ? '' : 's'} left today.`,
    'When you are proposing a written-plan edit, end the reply with this exact trailer (nothing after it):',
    '<<<PLAN_CHANGE',
    '{"action":"propose","scope":"diet|workout|both","requestText":"full edit in the client\'s words plus your clear summary"}',
    '>>>',
    'If you are not proposing a written-plan edit, omit the trailer.',
    'Never claim the plan is already updated. A YES only sends the request to the coach. This chat does not rewrite the plan.',
  ].join('\n')
}

export function withConfirmCue(visible: string, remainingToday: number): string {
  if (/reply\s+yes/i.test(visible)) return visible
  const left =
    remainingToday <= 0
      ? 'You are out of plan edits for today.'
      : `Reply YES to send this to your coach (${remainingToday} left today). Reply NO to cancel.`
  return `${visible}\n\n${left}`
}
