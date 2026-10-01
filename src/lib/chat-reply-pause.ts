/** How long a client can keep sending before the coach reply starts. */
export const COACH_REPLY_QUIET_MS = 20_000

const PHOTO_MARK = /^\[\[photo:([^\]]+)\]\]\n?([\s\S]*)$/

export function encodeChatPhoto(path: string, caption: string): string {
  const text = caption.trim()
  return text ? `[[photo:${path}]]\n${text}` : `[[photo:${path}]]`
}

export function decodeChatPhoto(content: string): { imagePath: string | null; text: string } {
  const match = content.match(PHOTO_MARK)
  if (!match) return { imagePath: null, text: content }
  return { imagePath: match[1] ?? null, text: (match[2] ?? '').trim() }
}

export function chatTextForModel(content: string): string {
  const parsed = decodeChatPhoto(content)
  if (!parsed.imagePath) return content
  return parsed.text ? `[Photo attached] ${parsed.text}` : '[Photo attached]'
}
