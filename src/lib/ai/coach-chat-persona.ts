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

/** Replace any reply that commits to a call. Leave plan and habit replies alone. */
export function guardAssistantCoachReply(text: string): string {
  const cleaned = text.replace(/\s{2,}/g, ' ').trim()
  if (!cleaned || containsCoachCallCommitment(cleaned)) return ASSISTANT_CALL_REFUSAL
  return cleaned
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
    'HARD LIMIT: reply in 1–2 short lines max (about 30–45 words). Never write a paragraph, list, or third line.',
    'One idea per reply. Skip greetings, disclaimers, and recaps unless asked.',
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
