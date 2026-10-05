export type PlanChangeScope = 'diet' | 'workout' | 'both'

export type PendingPlanChange = {
  scope: PlanChangeScope
  requestText: string
  createdAt: string
}

const TRAILER_RE = /<<<PLAN_CHANGE\s*([\s\S]*?)\s*>>>/i

const CONFIRM_RE =
  /^(yes|yeah|yep|yup|ok|okay|sure|do it|go ahead|lock it|lock in|confirm|update (my )?plan|haan|haa|bilkul|kar do|karde|please (do|update|lock))\b/i

const CANCEL_RE =
  /^(no|nope|cancel|never ?mind|leave it|not now|mat kar|nahi|na)\b/i

const APPLY_NOW_RE =
  /\b(lock (it |this )?in|update my (written )?plan|change my (written )?(diet|workout|plan)|rewrite my (diet|workout|plan)|apply (this|the) change)\b/i

export function isPlanChangeConfirm(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 80) return false
  return CONFIRM_RE.test(t)
}

export function isPlanChangeCancel(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 80) return false
  return CANCEL_RE.test(t)
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
    'If they want the written diet or workout rewritten, summarise the edit, then ask them to reply YES to lock it into My Plan.',
    `They have ${remainingToday} plan edit${remainingToday === 1 ? '' : 's'} left today.`,
    'When you are proposing a written-plan edit, end the reply with this exact trailer (nothing after it):',
    '<<<PLAN_CHANGE',
    '{"action":"propose","scope":"diet|workout|both","requestText":"full edit in the client\'s words plus your clear summary"}',
    '>>>',
    'If you are not proposing a written-plan edit, omit the trailer.',
    'Never claim the plan is already updated until the system confirms the lock-in.',
  ].join('\n')
}

export function withConfirmCue(visible: string, remainingToday: number): string {
  if (/reply\s+yes/i.test(visible)) return visible
  const left =
    remainingToday <= 0
      ? 'You are out of plan edits for today.'
      : `Reply YES to lock this into My Plan (${remainingToday} left today). Reply NO to cancel.`
  return `${visible}\n\n${left}`
}
