/** Smart Coach documents. Photos and voice notes stay on their own paths. */

export const CHAT_FILE_BUCKET = 'chat-files'
export const CHAT_FILE_MAX_BYTES = 15_000_000
const EXTRACT_LIMIT = 12_000

const VIDEO_EXT = new Set([
  'mp4',
  'm4v',
  'mov',
  'webm',
  'avi',
  'mkv',
  'mpeg',
  'mpg',
  'wmv',
  'flv',
  '3gp',
  '3gpp',
  'ogv',
  'ts',
  'mts',
  'vob',
])

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'avif'])

const FILE_MARK = /^\[\[file:([^\]|]+)\|([^\]]+)\]\]\n?([\s\S]*)$/
const EXTRACT_SPLIT = '\n[[extract]]\n'

export type DecodedChatFile = {
  path: string | null
  name: string
  text: string
  extract: string
}

export function fileExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''
  if (!ext || ext === name.toLowerCase().replace(/[^a-z0-9]/g, '')) return ''
  return ext
}

export function isVideoFile(name: string, mime?: string | null): boolean {
  if (mime && /^video\//i.test(mime)) return true
  return VIDEO_EXT.has(fileExtension(name))
}

export function isImageFile(name: string, mime?: string | null): boolean {
  if (mime && /^image\//i.test(mime)) return true
  return IMAGE_EXT.has(fileExtension(name))
}

export function safeChatFileName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || 'file'
  const cleaned = base.replace(/[|\]]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 120) || 'file'
}

export function aiCoachFileStoragePath(userId: string, fileName: string, now = Date.now()): string {
  const id = userId.trim()
  if (!id || id.includes('/') || id.includes('..')) throw new Error('Invalid account')
  const ext = fileExtension(fileName)
  const safeExt = ext && !VIDEO_EXT.has(ext) ? ext.slice(0, 8) : 'bin'
  return `${id}/ai-chat/${now}.${safeExt}`
}

export function encodeChatFile(path: string, name: string, caption: string, extract?: string | null): string {
  const head = `[[file:${path}|${safeChatFileName(name)}]]`
  const note = caption.trim()
  const body = extract?.trim()
    ? `${note}${note ? EXTRACT_SPLIT : `[[extract]]\n`}${bodyClip(extract)}`
    : note
  return body ? `${head}\n${body}` : head
}

function bodyClip(extract: string): string {
  const text = extract.trim()
  if (text.length <= EXTRACT_LIMIT) return text
  return `${text.slice(0, EXTRACT_LIMIT)}\n[The rest of the file was longer than one message, so it was cut here.]`
}

export function decodeChatFile(content: string): DecodedChatFile {
  const match = content.match(FILE_MARK)
  if (!match) return { path: null, name: '', text: content, extract: '' }
  const raw = match[3] ?? ''
  const splitAt = raw.indexOf(EXTRACT_SPLIT)
  if (splitAt === -1 && raw.startsWith('[[extract]]\n')) {
    return {
      path: match[1] ?? null,
      name: match[2] ?? 'file',
      text: '',
      extract: raw.slice('[[extract]]\n'.length).trim(),
    }
  }
  if (splitAt === -1) {
    return { path: match[1] ?? null, name: match[2] ?? 'file', text: raw.trim(), extract: '' }
  }
  return {
    path: match[1] ?? null,
    name: match[2] ?? 'file',
    text: raw.slice(0, splitAt).trim(),
    extract: raw.slice(splitAt + EXTRACT_SPLIT.length).trim(),
  }
}

export function chatFileTextForModel(content: string): string | null {
  const file = decodeChatFile(content)
  if (!file.path) return null
  const lines = [`[File: ${file.name}]`]
  if (file.text) lines.push(file.text)
  if (file.extract) lines.push(`File contents:\n${file.extract}`)
  else lines.push('The file was attached but its text could not be read. Ask them to paste the important lines. Do not guess the contents.')
  return lines.join('\n')
}
