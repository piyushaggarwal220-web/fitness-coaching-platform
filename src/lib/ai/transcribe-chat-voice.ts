import OpenAI, { toFile } from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_BYTES = 8_000_000

export function ownVoicePath(path: string, userId: string): boolean {
  if (!path || path.includes('..') || path.includes('\\') || path.startsWith('/')) return false
  return path.startsWith(`${userId}/`)
}

/** Whisper transcript for a voice note the client already uploaded. Null if it cannot be heard. */
export async function transcribeChatVoice(
  admin: SupabaseClient,
  path: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const { data, error } = await admin.storage.from('chat-voice').download(path)
  if (error || !data) return null
  const bytes = Buffer.from(await data.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_BYTES) return null

  const name = path.split('/').pop() || 'note.webm'
  const file = await toFile(bytes, name)
  const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 })
  const result = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  })
  const text = result.text?.trim()
  return text || null
}
