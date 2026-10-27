export const CHAT_MOODS = [
  { id: 'auto', label: 'Match me' },
  { id: 'calm', label: 'Calm' },
  { id: 'strict', label: 'Strict' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'short', label: 'Short' },
  { id: 'fired_up', label: 'Fired up' },
] as const

export type ChatMood = (typeof CHAT_MOODS)[number]['id']

const IDS = new Set<string>(CHAT_MOODS.map((item) => item.id))

export function parseChatMood(value: unknown): ChatMood | null {
  if (typeof value !== 'string') return null
  return IDS.has(value) ? (value as ChatMood) : null
}

/** Chosen mood replaces the automatic tone. auto keeps readClientMood. */
export function chatMoodDirective(mood: Exclude<ChatMood, 'auto'>): string {
  if (mood === 'calm') {
    return 'Stay calm and steady. Low pressure, no hype, short lines. Still hold the written plan.'
  }
  if (mood === 'strict') {
    return 'Be strict and short. Clear rules. Hold them to the written plan. No waffle.'
  }
  if (mood === 'friendly') {
    return 'Be warm and friendly, like a person who knows them. Still a coach. Do not fold if they challenge the plan.'
  }
  if (mood === 'short') {
    return 'Answer in one or two short lines unless they asked for detail.'
  }
  return 'More energy. Nudge them to do the next thing. Stay practical. No hype essay.'
}
