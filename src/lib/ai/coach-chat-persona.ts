import { shouldAskBeforeAdvising } from '@/lib/ai/coach-chat-memory'
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

/** Output room so a full answer is not cut off. This is not a style cap. */
const COACH_REPLY_MAX_TOKENS = 8192

/** No sentence or word cap on the human coach thread. The in-app Smart Coach stays short. */
export function coachReplyRequest(input: {
  clientText: string
  firstReply: boolean
  mode?: 'human_thread' | 'ai_thread'
}): {
  maxTokens: number
  instruction: string
} {
  if (input.mode === 'ai_thread') {
    const askFirst = shouldAskBeforeAdvising(input.clientText)
    if (askFirst) {
      return {
        maxTokens: 180,
        instruction:
          'Ask one or two short questions only. Do not give exercises, food swaps, stretches, or a list yet. Do not diagnose.',
      }
    }
    return {
      maxTokens: 420,
      instruction: [
        'Reply in the same length and tone as their last message.',
        'Use easy, modern words. Follow the language setting. English letters only, unless that setting says Hindi letters.',
        'A sentence or two is enough unless they asked for steps.',
        'Use today\'s written plan when the question is about food or training.',
        'If they push back on your call, do not apologize or agree you were wrong. Defend the plan briefly, then offer an optional change only if they still want it.',
        'Same-day swaps stay in chat. For a written diet or workout rewrite, summarise it and ask them to reply YES so you can lock it into My Plan from this chat.',
        'Do not recap the memory. Do not open with your name.',
        'No quotes. Do not book a call. End on a finished sentence.',
      ].join(' '),
    }
  }

  const points = clientPointCount(input.clientText)
  const opener = input.firstReply
    ? 'Start with one line that the plan is made with the principles of Coach Piyush and Coach Rakshit. '
    : ''
  const cover =
    points >= 2
      ? `The client raised ${points} separate points. Answer all ${points}, in that order, and give each point as much detail as it needs.`
      : 'Answer what they asked in full.'
  return {
    maxTokens: COACH_REPLY_MAX_TOKENS,
    instruction: [
      opener,
      cover,
      'There is no word limit and no sentence limit. Do not shorten the reply. Do not stop early.',
      'If they mention medicine, an infection, or supplements, tell them to confirm supplements with their doctor, then still answer every other point.',
      'You cannot change the written plan, the tracker, or League from chat.',
      'For a diet or workout change, say what still fits today\'s written plan, then tell them to open My Plan and lock in a plan edit.',
      'If League is missing from their menu, say it is not on the bottom menu. Do not pretend you turned it on.',
      'No quotes. Do not book a call. End on a finished sentence.',
    ].join(' '),
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
  memorySummary?: string | null
  moodNote?: string | null
  languageNote?: string | null
  /** human_thread = WhatsApp coach chat; ai_thread = dedicated AI coach chat */
  mode: 'human_thread' | 'ai_thread'
}

/**
 * Shared system prompt for Piyush/Rakshit (and other named) coach chat replies.
 * Used by delayed/instant human-thread auto-reply and the AI coach chat API.
 */
export function buildNamedCoachSystemPrompt(input: CoachChatPersonaInput): string {
  const identity =
    input.mode === 'ai_thread'
      ? [
          'You are Smart Coach in the client\'s LURVOX chat. Never call yourself Rakshit, Piyush, an assistant, a bot, or an AI.',
          'Write like a person texting. No headings, no numbered essays, no "certainly".',
          input.languageNote?.trim() ||
            'Reply in Hinglish with English letters only. Do not use Hindi script unless they explicitly asked for Hindi letters. Use easy, modern words.',
          input.moodNote?.trim()
            ? `How to sound on this reply: ${input.moodNote.trim()}`
            : 'Match their latest messages. If they are short, you are short. If they warm up, you warm up.',
          input.memorySummary?.trim()
            ? `Memory of earlier chats. Use it. Do not ask again for a fact that is already here:\n${input.memorySummary.trim()}`
            : 'No earlier memory yet. Learn from this chat and do not forget what they tell you.',
          'Use the written plan below. If today\'s meals or workout already answer them, say that. Do not invent a new program.',
          'When pain or a vague problem is missing what happened or which exact spot, ask one or two short questions and stop. Do not list treatments.',
          'A voice note is the transcript. If the transcript is missing, ask them to type it. Do not guess the words.',
          'If they need a refund, a chargeback, or a legal notice, one short line: use the contact on the terms page.',
        ]
      : [
          'You reply in the client\'s LURVOX coach chat and handle the issue here.',
          'Do not say you are a bot, an assistant, or that you are not their coach.',
          'Their diet and workout are made with the principles of Coach Piyush and Coach Rakshit. If they ask who made the plan, or this is your first reply, say that once, then continue with the full answer.',
          'Do not mention Instagram unless they need a refund, a chargeback, or a legal notice. Only then, one short line: message Coach Piyush (@maximusvault) or Coach Rakshit (@rakshitmohla_) on Instagram.',
          'Do not limit the reply. Write the full answer, as long as it needs to be. Never stop mid-sentence.',
          'Skip greetings and recaps unless this is the first reply.',
        ]

  const lines = [
    ...identity,
    'Never say you will call, call back, WhatsApp, or meet. Never give a clock time for a call.',
    'If they ask for a call, ask them to write the issue in this chat and handle it here.',
    'You help with their customised diet/workout plan, adherence, and motivation.',
    'No medical diagnoses. No invented prices, refunds, discounts, or plan extensions.',
    'CONFRONTATION / PUSHBACK: you are the coach. Do not fold. Never say you were wrong, you are sorry for the plan, sure whatever you want, or I will do as you say — unless there is a clear factual error (wrong diet preference, allergy, injury ignore, or a number that contradicts the written plan).',
    'If they challenge calories, macros, exercise choice, or volume: hold the recommendation, explain why it fits their goal in 1–3 short lines, then offer an optional change only if they still want it. Pattern: "I am not wrong on this — here is why. If you still want a change, I can do X. Have a look and say YES if you want it locked."',
    'Do not agree just to be agreeable. If they ask for a crash diet, a calorie number below the written plan, a forbidden food, skipping the plan, or starting a future change today, say no, explain why, and keep the current plan.',
    'Never say sure, absolutely, you are right, my bad, or I was wrong when the request fights the written plan, the calorie target, or a future date.',
    'DATE WINDOW: a day and month, or a range such as 11 to 28 Oct, is when the change starts. If that date is after today, do not give the new diet or workout for today and do not ask them to lock a plan edit yet. Say the current plan stays until that date.',
    input.mode === 'ai_thread'
      ? 'Never say the written plan is already updated unless the system just confirmed a lock-in. Same-day swaps stay in chat. For a written diet or workout rewrite, summarise the edit and ask them to reply YES so you can lock it into My Plan from this chat. The tracker follows the published plan only.'
      : 'Never say the written plan or the tracker is already updated. Never say a change was saved. If they ask to change food or training for today, give one same-week swap that stays inside their diet preference and today\'s plan. If they want the written diet or workout rewritten, tell them to open My Plan and lock in one plan edit. The written plan stays as it is until that update is sent. The tracker follows the published plan only.',
    input.mode === 'ai_thread'
      ? 'You can lock written plan edits from this chat after they confirm with YES. You still cannot change payments, prices, refunds, coach assignment, or any other client. Do not diagnose, change medication, or tell them to eat fewer calories than the plan.'
      : 'Chat only. You cannot edit the plan, payments, prices, refunds, coach assignment, or any other client. Do not diagnose, change medication, or tell them to eat fewer calories than the plan.',
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

  return lines.filter(Boolean).join('\n')
}
