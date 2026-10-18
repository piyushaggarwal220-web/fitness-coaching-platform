export type ClientChatMood = 'frustrated' | 'worried' | 'casual' | 'brief' | 'warm' | 'plain'

const FRUSTRATED =
  /\b(useless|waste|stupid|wtf|angry|annoyed|frustrated|not working|doesn'?t work|does not work|bakwas|bekar|faltu)\b|!{2,}/i
const WORRIED =
  /\b(scared|worried|anxious|nervous|pain|paining|hurts?|hurt|aching|sore|injury|injured|afraid|tension)\b/i
const CASUAL =
  /\b(yaar|bhai|bro|lol|haha|lmao|nahi|nahin|kya|acha|accha|theek|thik|haan|han|karu)\b|[\u0900-\u097F]/
const WARM = /\b(thank|thanks|appreciate|grateful|dhanyavad|shukriya)\b/i
const SYMPTOM =
  /\b(pain|paining|hurts?|hurt|aching|ache|sore|injury|injured|swollen|sprain|strain|sick|fever|dizzy|can'?t train|cannot train|not feeling)\b/i
const DETAIL =
  /\b(left|right|wrist|elbow|shoulder|knee|ankle|back|neck|finger|thumb|palm|forearm|hip|shin|since|yesterday|fell|twisted|while|when i|after i)\b/i
const VAGUE =
  /^(help|what should i do|i need help|not sure|confused|any advice|kya karu|what now|idk|i don'?t know)\b/i

const TONE: Record<ClientChatMood, string> = {
  frustrated:
    'They are annoyed. Stay firm and short. No apology, no folding, no "sorry/confusion". One line that you heard them, then defend the written plan. Offer a change only if they still ask.',
  worried: 'They are uneasy. Stay calm and short. Do not lecture and do not scare them. Still hold the plan unless safety is involved.',
  casual: 'They are texting casually. Text back the same way. No formal coach voice. Still do not fold if they challenge the plan.',
  brief: 'They write short lines. Answer in one or two short lines unless they asked for detail.',
  warm: 'They are being friendly. Be warm back, still like a person, not a brochure.',
  plain: 'Talk like a normal person in a chat. Not a textbook and not a customer-service script. Stay coach-firm if challenged.',
}

/** Tone for the next reply, weighted to the latest messages. */
export function readClientMood(messages: string[]): { mood: ClientChatMood; note: string } {
  const recent = messages.map((line) => line.trim()).filter(Boolean).slice(-6)
  const latest = recent[recent.length - 1] ?? ''
  const blob = recent.join('\n')
  const hinglish = /\b(yaar|bhai|nahi|nahin|kya|hai|hoon|kar|mat|acha|accha|theek|thik|haan)\b|[\u0900-\u097F]/i.test(
    blob
  )
  const language = hinglish
    ? 'They are casual. Stay casual. Do not switch into Hindi script.'
    : 'Stay in the language already chosen for this chat.'

  let mood: ClientChatMood = 'plain'
  if (FRUSTRATED.test(latest) || (latest.length < 12 && FRUSTRATED.test(blob))) mood = 'frustrated'
  else if (WORRIED.test(latest)) mood = 'worried'
  else if (CASUAL.test(latest) || CASUAL.test(blob)) mood = 'casual'
  else if (latest.length > 0 && latest.length < 40 && recent.every((line) => line.length < 80)) mood = 'brief'
  else if (WARM.test(latest)) mood = 'warm'

  return { mood, note: `${TONE[mood]} ${language}` }
}

/** True when a dump of advice would skip facts the coach still needs. */
export function shouldAskBeforeAdvising(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/no transcript/i.test(trimmed)) return true
  if (VAGUE.test(trimmed)) return true
  if (!SYMPTOM.test(trimmed)) return false
  if (DETAIL.test(trimmed) && trimmed.length > 40) return false
  return true
}

/** Raw turns kept in full for the next reply. Older turns get summarised. */
export const COACH_LIVE_TURNS = 16
/** Compact once this many turns have fallen out of the live window. */
export const COACH_COMPACT_AFTER = 12
/** How many aged-out turns one summary pass may fold in. */
export const COACH_COMPACT_MAX_TURNS = 40
export const COACH_MEMORY_MAX_CHARS = 4000

export function clipCoachMemory(text: string): string {
  const cleaned = text.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+\n/g, '\n').trim()
  if (cleaned.length <= COACH_MEMORY_MAX_CHARS) return cleaned
  return `${cleaned.slice(0, COACH_MEMORY_MAX_CHARS).trimEnd()}…`
}

/**
 * Oldest-first turns that are already outside the live window and not yet
 * summarised. A short gap waits. A full gap is summarised, then the next gap.
 */
export function selectTurnsToCompact<T>(pendingOldestFirst: readonly T[]): T[] {
  if (pendingOldestFirst.length < COACH_COMPACT_AFTER) return []
  return pendingOldestFirst.slice(0, COACH_COMPACT_MAX_TURNS)
}

/** Fold aged-out turns into the running proceedings summary. */
export function buildCoachMemoryUpdatePrompt(input: {
  previous: string
  turns: string
  older?: string
}): { systemPrompt: string; userPrompt: string } {
  const olderTurns = input.older?.trim() || input.turns.trim()
  return {
    systemPrompt: [
      'You keep a running summary of one fitness client\'s coach chat.',
      'Merge the previous summary with the older turns. Keep the proceedings.',
      'Keep what they asked, what was decided, injuries and which details are still unknown, foods they avoid, schedule limits, plan edits they confirmed or refused, and questions still open.',
      'Drop greetings and repeated small talk. Do not invent anything that was not in the summary or the turns.',
      'Plain sentences. Under 4000 characters.',
    ].join(' '),
    userPrompt: [
      `Previous summary:\n${input.previous.trim() || '(none)'}`,
      `Older turns to fold in:\n${olderTurns || '(none)'}`,
    ].join('\n\n'),
  }
}
