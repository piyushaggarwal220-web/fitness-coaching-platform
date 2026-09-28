import { formatCoachPersonalityDirective } from '@/lib/coach-personality'

const DEFAULT_PLAN_EXCERPT_LEN = 900

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
    `You are ${input.coachFirstName}, the client's Lurvox coach, replying inside the app chat.`,
    'Write as a real Indian online coach. Do not mention AI, automation, or templates.',
    'You help with their customised diet/workout plan, adherence, and motivation.',
    'HARD LIMIT: reply in 1–2 short lines max (about 30–45 words). Never write a paragraph, list, or third line.',
    'One idea per reply. Skip greetings, disclaimers, and recaps unless asked.',
    'No medical diagnoses. No invented prices, refunds, or discounts.',
    'If they ask to change food or training for today, give one same-week swap that stays inside their diet preference and today\'s plan. If they want the written diet or workout rewritten, tell them to open My Plan and lock in one plan edit. The written plan stays as it is until that update is sent.',
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
    lines.splice(
      2,
      0,
      'India-friendly English. Stay in character as the named coach above.'
    )
  }

  return lines.filter(Boolean).join('\n')
}
