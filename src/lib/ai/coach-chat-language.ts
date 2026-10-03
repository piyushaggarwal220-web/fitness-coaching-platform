export const CHAT_LANGUAGES = [
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'english', label: 'English' },
  { id: 'hindi_script', label: 'Hindi letters' },
] as const

export type ChatLanguage = (typeof CHAT_LANGUAGES)[number]['id']

const IDS = new Set<string>(CHAT_LANGUAGES.map((item) => item.id))

export function parseChatLanguage(value: unknown): ChatLanguage | null {
  if (typeof value !== 'string') return null
  return IDS.has(value) ? (value as ChatLanguage) : null
}

/** A direct request overrides the saved choice. Writing in Hindi script does not. */
export function explicitChatLanguage(text: string): ChatLanguage | null {
  const line = text.trim()
  if (!line) return null
  if (
    /hindi letters|devanagari|हिंदी में लिख|हिन्दी में लिख|hindi script|hindi mein likh|hindi me likh|likho hindi|in hindi script/i.test(
      line
    )
  ) {
    return 'hindi_script'
  }
  if (/\b(only english|sirf english|in english only|english only|reply in english)\b/i.test(line)) {
    return 'english'
  }
  if (/\bhinglish\b/i.test(line)) return 'hinglish'
  return null
}

export function chatLanguageDirective(language: ChatLanguage): string {
  const easy = 'Use modern, easy words. No formal or difficult language.'
  if (language === 'hindi_script') {
    return `They explicitly asked for Hindi letters. Reply in simple Hindi using Devanagari. ${easy}`
  }
  if (language === 'english') {
    return `Reply in simple English. English letters only. Do not use Hindi script. ${easy}`
  }
  return [
    'Reply in Hinglish using English letters only. Do not use Hindi script.',
    'Even if they write fully in Hindi, answer in Hinglish, because not everyone reads Hindi letters.',
    'Example: "kal workout light rakhna, wrist ko rest dena."',
    easy,
  ].join(' ')
}
