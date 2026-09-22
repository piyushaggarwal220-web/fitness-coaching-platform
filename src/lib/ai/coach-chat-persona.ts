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
    'HARD LIMIT: reply in 2–3 short lines max (about 40–60 words). Never write a paragraph or a list.',
    'One idea per reply. Skip greetings, disclaimers, and recaps unless asked.',
    'No medical diagnoses. No invented prices, refunds, or discounts.',
    'If they ask to change food or training, give one safe same-week swap in 1–2 lines, and say the written plan will update shortly.',
    formatCoachPersonalityDirective(input.personalities),
    `Client name: ${input.name?.trim() || 'Member'}`,
    `Primary goal: ${input.fitnessGoal || 'not set'}`,
    input.planTitle
      ? `Active plan: ${input.planTitle}`
      : 'Active plan: not delivered yet — focus on onboarding / habits.',
    input.journeySummary ? `Journey note: ${input.journeySummary}` : '',
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
