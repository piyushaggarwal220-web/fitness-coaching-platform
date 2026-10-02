import { formatCoachPersonalityDirective } from '@/lib/coach-personality'

const DEFAULT_PLAN_EXCERPT_LEN = 900

/** Client-facing name. Never the human coach's name. */
export const ASSISTANT_COACH_LABEL = 'Assistant coach'

const CALL_COMMITMENT =
  /\b(i['’]?ll call|i will call you|i can call you|going to call you|call you back|calling you|give you a call|whatsapp you|phone you|jump on a call|book(?:ed|ing)? (?:a |your )?call|your call is|expect (?:my |a )?call)\b/i

const CLOCK_TIME = /\b\d{1,2}(:\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\b/i

export const ASSISTANT_CALL_REFUSAL =
  'I can’t take a call. Write what you need here and I’ll handle it in this chat.'

/** True when a reply books, confirms, or times a call as if the sender were the coach. */
export function containsCoachCallCommitment(text: string): boolean {
  if (CALL_COMMITMENT.test(text)) return true
  return /\b(call|callback|call back)\b/i.test(text) && CLOCK_TIME.test(text)
}

/** Replace any reply that commits to a call. Keep line breaks so a multi-point answer stays readable. */
export function guardAssistantCoachReply(text: string): string {
  const cleaned = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!cleaned || containsCoachCallCommitment(cleaned)) return ASSISTANT_CALL_REFUSAL
  return cleaned
}

/** How many separate asks are in the text the coach still has to answer. */
export function clientPointCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const pieces = trimmed
    .split(/\n+/)
    .flatMap((line) => line.split(/\s*[•·]\s+/))
    .map((part) => part.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((part) => part.length > 12)
  if (pieces.length >= 2) return pieces.length
  const questions = trimmed.match(/\?/g)?.length ?? 0
  return Math.max(questions, 1)
}

export function unansweredClientText(
  turns: Array<{ fromClient: boolean; content: string | null | undefined }>
): string {
  const chunks: string[] = []
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (!turns[i].fromClient) break
    const text = turns[i].content?.trim()
    if (text) chunks.unshift(text)
  }
  return chunks.join('\n')
}

const INCOMPLETE_REPLY_FOLLOW_UP =
  /\b(rest|all (?:of|my)|every|didn'?t answer|did not answer|incomplete|other (?:points|questions)|remaining|you missed|not answered|longer answer)\b/i

/** Text the length budget should cover. A short "answer the rest" still includes the earlier list. */
export function clientTextForReply(
  turns: Array<{ fromClient: boolean; content: string | null | undefined }>
): string {
  const pending = unansweredClientText(turns)
  if (clientPointCount(pending) >= 2 || !INCOMPLETE_REPLY_FOLLOW_UP.test(pending)) return pending
  let seenCoach = false
  const earlier: string[] = []
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (!seenCoach) {
      if (!turns[i].fromClient) seenCoach = true
      continue
    }
    if (!turns[i].fromClient) break
    const text = turns[i].content?.trim()
    if (text) earlier.unshift(text)
  }
  return [...earlier, pending].filter(Boolean).join('\n')
}

/** One question stays short. A list gets one finished sentence per point, with room to complete it. */
export function coachReplyRequest(input: { clientText: string; firstReply: boolean }): {
  maxTokens: number
  instruction: string
} {
  const points = clientPointCount(input.clientText)
  const opener = input.firstReply
    ? 'Start with one short line that the plan is made with the principles of Coach Piyush and Coach Rakshit. '
    : ''
  const close = 'No quotes. Do not book a call. End on a finished sentence.'
  if (points >= 2) {
    return {
      maxTokens: 900,
      instruction: [
        opener,
        `The client raised ${points} separate points. Answer all ${points}, in that order.`,
        'Put each answer on its own line as one finished sentence.',
        'Do not stop after the first point, and do not stop after the medicine or supplement point.',
        'If they mention medicine, an infection, or supplements, the first sentence tells them to confirm supplements with their doctor. Then answer every other point.',
        'You cannot change the written plan, the tracker, or League from chat.',
        'For a diet or workout change, say what still fits today\'s written plan, then tell them to open My Plan and lock in a plan edit.',
        'If League is missing from their menu, say it is not on the bottom menu. Do not pretend you turned it on.',
        close,
      ].join(' '),
    }
  }
  return {
    maxTokens: 320,
    instruction: `${opener}They asked one thing. Answer it in 2 to 4 finished sentences. ${close}`,
  }
}

/** Truncate plan text for chat context without blowing the prompt. */
export function truncatePlanExcerpt(
  text: string | null | undefined,
  max = DEFAULT_PLAN_EXCERPT_LEN
): string | null {
  const trimmed = text?.trim()
  if (!trimmed) return null
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trimEnd()}…`
}

export type CoachChatPersonaInput = {
  coachFirstName: string
  name: string | null
  fitnessGoal: string | null
  personalities: string[] | null
  planTitle: string | null
  journeySummary: string | null
  nutritionExcerpt?: string | null
  workoutExcerpt?: string | null
  dietPreference?: string | null
  injuryNote?: string | null
  allergyNote?: string | null
  purchasedPlanLine?: string | null
  todayPlan?: string | null
  trackerLine?: string | null
  checkinLine?: string | null
  /** human_thread = WhatsApp coach chat; ai_thread = dedicated AI coach chat */
  mode: 'human_thread' | 'ai_thread'
}

/**
 * Shared system prompt for Piyush/Rakshit (and other named) coach chat replies.
 * Used by delayed/instant human-thread auto-reply and the AI coach chat API.
 */
export function buildNamedCoachSystemPrompt(input: CoachChatPersonaInput): string {
  const lines = [
    `You reply in the client's LURVOX coach chat and handle the issue here.`,
    'Do not say you are a bot, an assistant, or that you are not their coach.',
    'Their diet and workout are made with the principles of Coach Piyush and Coach Rakshit. If they ask who made the plan, or this is your first reply, say that in one short line.',
    'Never say you will call, call back, WhatsApp, or meet. Never give a clock time for a call.',
    'If they ask for a call, ask them to write the issue in this chat and handle it here.',
    'Do not mention Instagram unless they need a refund, a chargeback, or a legal notice. Only then, one short line: message Coach Piyush (@maximusvault) or Coach Rakshit (@rakshitmohla_) on Instagram.',
    'You help with their customised diet/workout plan, adherence, and motivation.',
    'Length follows the reply instruction. One question gets 2 to 4 finished sentences. Several questions get one finished sentence for every point, in order. Never stop mid-sentence.',
    'Skip greetings and recaps unless this is the first reply.',
    'No medical diagnoses. No invented prices, refunds, discounts, or plan extensions.',
    'Do not agree just to be agreeable. If they ask for a crash diet, a calorie number below the written plan, a forbidden food, skipping the plan, or starting a future change today, say no in one line and keep the current plan.',
    'Never say sure, absolutely, or you are right when the request fights the written plan, the calorie target, or a future date.',
    'DATE WINDOW: a day and month, or a range such as 11 to 28 Oct, is when the change starts. If that date is after today, do not give the new diet or workout for today and do not tell them to lock in a plan edit yet. Say the current plan stays until that date.',
    'Never say the written plan or the tracker is already updated. Never say a change was saved.',
    'If they ask to change food or training for today, give one same-week swap that stays inside their diet preference and today\'s plan. If they want the written diet or workout rewritten, tell them to open My Plan and lock in one plan edit. The written plan stays as it is until that update is sent. The tracker follows the published plan only.',
    'Chat only. You cannot edit the plan, payments, prices, refunds, coach assignment, or any other client. Do not diagnose, change medication, or tell them to eat fewer calories than the plan.',
    formatCoachPersonalityDirective(input.personalities),
    `Client name: ${input.name?.trim() || 'Member'}`,
    `Primary goal: ${input.fitnessGoal || 'not set'}`,
    input.planTitle
      ? `Active plan: ${input.planTitle}`
      : 'Active plan: not delivered yet — focus on onboarding / habits.',
    input.journeySummary ? `Journey note: ${input.journeySummary}` : '',
    input.dietPreference ? `Diet preference: ${input.dietPreference}` : '',
    input.allergyNote ? `Allergies: ${input.allergyNote}` : '',
    input.injuryNote ? `Injury or pain note: ${input.injuryNote}` : '',
    input.purchasedPlanLine ? input.purchasedPlanLine : '',
    input.todayPlan ? `Today on the written plan:\n${input.todayPlan}` : '',
    input.trackerLine ? input.trackerLine : '',
    input.checkinLine ? input.checkinLine : '',
    input.nutritionExcerpt ? `Diet chart excerpt:\n${input.nutritionExcerpt}` : '',
    input.workoutExcerpt ? `Workout plan excerpt:\n${input.workoutExcerpt}` : '',
  ]

  if (input.mode === 'ai_thread') {
    lines.splice(6, 0, 'India-friendly English. Answer in this chat.')
  }

  return lines.filter(Boolean).join('\n')
}
