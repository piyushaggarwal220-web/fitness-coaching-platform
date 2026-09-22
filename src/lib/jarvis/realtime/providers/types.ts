/**
 * Provider interfaces — business layer must not know provider details.
 */

import type { SynthesisResult, TranscriptionResult } from '@/lib/jarvis/realtime/types'

export interface SpeechToTextProvider {
  name: string
  configured: boolean
  transcribe(input: {
    audio: Buffer
    mimeType: string
    filename?: string
  }): Promise<TranscriptionResult>
}

export interface TextToSpeechProvider {
  name: string
  configured: boolean
  synthesize(input: {
    text: string
    voice?: string
  }): Promise<SynthesisResult>
}

/** Strip content that must never be spoken. */
export function sanitizeTextForSpeech(text: string): string {
  let t = text
  // Strip code blocks / JSON-looking blobs
  t = t.replace(/```[\s\S]*?```/g, ' ')
  t = t.replace(/\{[\s\S]{80,}\}/g, ' ')
  // Strip likely secrets
  t = t.replace(
    /\b(sk-[a-zA-Z0-9_-]{10,}|shpat_[a-zA-Z0-9]+|Bearer\s+[a-zA-Z0-9._-]+)\b/gi,
    '[redacted]'
  )
  t = t.replace(/\b(api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/gi, '[redacted]')
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim()
  // Keep voice concise
  if (t.length > 800) {
    t = `${t.slice(0, 780).trim()}…`
  }
  return t
}

/** Explicit approval phrases only — never treat "haan" / "ok" as approval. */
export function isExplicitApprovalPhrase(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(approve|approved|yes,?\s*approve|i approve)[.!]?$/.test(t)
}

export function isExplicitRejectPhrase(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(reject|rejected|deny|denied|no,?\s*reject|cancel( that)?( approval)?)[.!]?$/.test(t)
}

export function isStopSpeakingPhrase(text: string): boolean {
  const t = text.trim().toLowerCase()
  return /^(stop( talking)?|quiet|shh|be quiet)[.!]?$/.test(t)
}
