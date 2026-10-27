export type PlanChangeScope = 'diet' | 'workout' | 'both'

export type PendingPlanChange = {
  scope: PlanChangeScope
  requestText: string
  createdAt: string
  /** Each message the client sent, in order. requestText is the summary of all of them. */
  fragments?: string[]
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

/** Another piece of an edit that is already being collected. */
export function continuesPlanEdit(text: string): boolean {
  const t = text.trim()
  if (t.length < 4 || t.length > 800) return false
  if (isPlanChangeConfirm(t) || isPlanChangeCancel(t)) return false
  if (SIDE_TOPIC_RE.test(t) && !PLAN_TOPIC_RE.test(t)) return false
  if (isSpecificPlanEditRequest(t)) return true
  if (/^(and|also|plus|same|more|less|no|not|without|add|remove|swap|instead|aur|bhi)\b/i.test(t)) return true
  return /\b(paneer|chicken|rice|roti|egg|eggs|whey|oats|dal|milk|curd|curl|squat|bench|deadlift|arms|legs|sets|reps|breakfast|lunch|dinner)\b/i.test(t)
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

export function mergePlanChangeScope(current: PlanChangeScope, next: PlanChangeScope): PlanChangeScope {
  if (current === next) return current
  return 'both'
}

export function inferPlanChangeScope(text: string): PlanChangeScope {
  const diet = /\b(diet|meal|meals|food|calorie|calories|breakfast|lunch|dinner|snack)\b/i.test(text)
  const workout = /\b(workout|workouts|exercise|exercises|split|sets|gym|arms|legs)\b/i.test(text)
  if (diet && workout) return 'both'
  if (workout) return 'workout'
  if (diet) return 'diet'
  return 'both'
}

/** Keep every fragment. People send the edit in pieces, not one message. */
export function mergePlanChangeFragments(
  existing: PendingPlanChange | null,
  incoming: PendingPlanChange
): PendingPlanChange {
  const incomingText = incoming.requestText.trim()
  const prior =
    existing?.fragments?.map((item) => item.trim()).filter(Boolean) ??
    (existing?.requestText.trim() ? [existing.requestText.trim()] : [])
  const fragments = [...prior]
  const already = fragments.some((item) => {
    const left = item.toLowerCase()
    const right = incomingText.toLowerCase()
    return left === right || left.includes(right)
  })
  if (incomingText && !already) fragments.push(incomingText)
  const requestText = fragments
    .map((item, index) => `${index + 1}. ${item.replace(/^\d+\.\s*/, '')}`)
    .join('\n')
    .slice(0, 4000)
  return {
    scope: existing ? mergePlanChangeScope(existing.scope, incoming.scope) : incoming.scope,
    requestText,
    fragments,
    createdAt: existing?.createdAt ?? incoming.createdAt,
  }
}

export function showRunningEditSummary(visible: string, pending: PendingPlanChange): string {
  const summary = pending.requestText.trim()
  if (!summary) return visible
  if (visible.toLowerCase().includes(summary.slice(0, 48).toLowerCase())) return visible
  return `${visible.trim()}\n\nSo far, the plan edit is:\n${summary}`
}

export function pendingPlanChangeDirective(pending: PendingPlanChange): string {
  return [
    'An earlier edit is still being collected. Keep every piece below. Do not drop an earlier piece when a new message arrives:',
    `Scope: ${pending.scope}`,
    pending.requestText,
    'Add the latest message to that list when it is another diet or workout change.',
    'If their latest message is not a plan change, answer that message. Do not ask YES or NO.',
    'Ask them to reply YES only when you are showing the full list.',
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
    'People send a plan edit in several messages. Keep every piece. Do not treat the latest sentence as the whole request.',
    'If they want the written diet or workout rewritten, show the full list of pieces so far, then ask them to reply YES when that list is complete.',
    'Do not ask a question when their message, the injury note, and the current plan already say what to change.',
    'Ask one question only when a required detail is missing, such as which exercise or which meal, and that detail is not in the plan or this chat. Never put that question in the same reply as a YES lock.',
    'A new piece is added to the list. Do not throw away the earlier pieces.',
    `They have ${remainingToday} plan edit${remainingToday === 1 ? '' : 's'} left today.`,
    'When you are collecting a written-plan edit, end the reply with this exact trailer (nothing after it):',
    '<<<PLAN_CHANGE',
    '{"action":"propose","scope":"diet|workout|both","requestText":"this message only, in the client\'s words"}',
    '>>>',
    'requestText is only the newest piece. Earlier pieces are kept for you.',
    'If you are not collecting a written-plan edit, omit the trailer.',
    'Never claim the plan is already updated. YES sends the full list to the planner, which checks the plan and then publishes it.',
  ].join('\n')
}

export function withConfirmCue(visible: string, remainingToday: number): string {
  if (/reply\s+yes/i.test(visible)) return visible
  const left =
    remainingToday <= 0
      ? 'You are out of plan edits for today.'
      : `Send any other change in the next message. Reply YES when the list is complete and I will update the plan (${remainingToday} left today). Reply NO to cancel.`
  return `${visible}\n\n${left}`
}
