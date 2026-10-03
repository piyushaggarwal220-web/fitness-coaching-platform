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
    'They are annoyed. Drop the cheer. One short line that you heard them, then the useful bit. No list.',
  worried: 'They are uneasy. Stay calm and short. Do not lecture and do not scare them.',
  casual: 'They are texting casually. Text back the same way. No formal coach voice.',
  brief: 'They write short lines. Answer in one or two short lines unless they asked for detail.',
  warm: 'They are being friendly. Be warm back, still like a person, not a brochure.',
  plain: 'Talk like a normal person in a chat. Not a textbook and not a customer-service script.',
}

/** Tone for the next reply, weighted to the latest messages. */
export function readClientMood(messages: string[]): { mood: ClientChatMood; note: string } {
  const recent = messages.map((line) => line.trim()).filter(Boolean).slice(-6)
  const latest = recent[recent.length - 1] ?? ''
  const blob = recent.join('\n')
  const hindi = /[\u0900-\u097F]/.test(blob)
  const hinglish = /\b(yaar|bhai|nahi|nahin|kya|hai|hoon|kar|mat|acha|accha|theek|thik|haan)\b/i.test(blob)
  const language = hindi
    ? 'They are writing in Hindi. Reply in Hindi.'
    : hinglish
      ? 'They mix Hindi and English. Reply in that same mix.'
      : 'Reply in the same language they used.'

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

export function clipCoachMemory(text: string): string {
  const cleaned = text.replace(/^["'`]+|["'`]+$/g, '').replace(/\s+\n/g, '\n').trim()
  if (cleaned.length <= 900) return cleaned
  return `${cleaned.slice(0, 900).trimEnd()}…`
}

/** Rewrite the private memory after each reply. Facts stay; chatter drops. */
export function buildCoachMemoryUpdatePrompt(input: {
  previous: string
  turns: string
  older?: string
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      'You keep a private memory for one fitness client so a later chat still knows them.',
      'Rewrite the memory. Do not append a diary.',
      'Keep only facts that change the next reply: injuries and which details are still unknown, foods they avoid, schedule limits, what they already answered, open questions, and how they like to be talked to.',
      'Drop greetings, repeated advice, prices, and anything you were not told.',
      'Plain sentences. Under 900 characters. No bullet list.',
    ].join(' '),
    userPrompt: [
      `Previous memory:\n${input.previous.trim() || '(none)'}`,
      input.older?.trim() ? `Older chat not in the memory yet:\n${input.older.trim()}` : '',
      `New exchange:\n${input.turns.trim() || '(none)'}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
