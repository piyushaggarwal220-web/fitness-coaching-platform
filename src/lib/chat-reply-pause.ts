/** How long a client can keep sending before the coach reply starts. */
export const COACH_REPLY_QUIET_MS = 20_000

const PHOTO_MARK = /^\[\[photo:([^\]]+)\]\]\n?([\s\S]*)$/
const VOICE_MARK = /^\[\[voice:([^\]]+)\]\]\n?([\s\S]*)$/

export function encodeChatPhoto(path: string, caption: string): string {
  const text = caption.trim()
  return text ? `[[photo:${path}]]\n${text}` : `[[photo:${path}]]`
}

export function decodeChatPhoto(content: string): { imagePath: string | null; text: string } {
  const match = content.match(PHOTO_MARK)
  if (!match) return { imagePath: null, text: content }
  return { imagePath: match[1] ?? null, text: (match[2] ?? '').trim() }
}

export function encodeChatVoice(path: string, transcript: string): string {
  const text = transcript.trim()
  return text ? `[[voice:${path}]]\n${text}` : `[[voice:${path}]]`
}

export function decodeChatVoice(content: string): { audioPath: string | null; text: string } {
  const match = content.match(VOICE_MARK)
  if (!match) return { audioPath: null, text: content }
  return { audioPath: match[1] ?? null, text: (match[2] ?? '').trim() }
}

export function chatTextForModel(content: string): string {
  const photo = decodeChatPhoto(content)
  if (photo.imagePath) return photo.text ? `[Photo attached] ${photo.text}` : '[Photo attached]'
  const voice = decodeChatVoice(content)
  if (voice.audioPath) {
    return voice.text
      ? `[Voice note] ${voice.text}`
      : '[Voice note with no transcript. Ask them to type what they said. Do not guess.]'
  }
  return content
}
