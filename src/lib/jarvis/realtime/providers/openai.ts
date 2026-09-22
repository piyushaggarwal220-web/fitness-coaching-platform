/**
 * OpenAI Whisper STT + TTS — server-side only.
 * Reuses OPENAI_API_KEY; does not enable realtime merely because the key exists
 * (caller must check JARVIS_REALTIME_ENABLED).
 */

import OpenAI from 'openai'
import { toFile } from 'openai'
import type { SpeechToTextProvider, TextToSpeechProvider } from '@/lib/jarvis/realtime/providers/types'
import { sanitizeTextForSpeech } from '@/lib/jarvis/realtime/providers/types'
import type { SynthesisResult, TranscriptionResult } from '@/lib/jarvis/realtime/types'

function clientOrNull(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

export class OpenAISpeechToTextProvider implements SpeechToTextProvider {
  name = 'openai_whisper'
  configured: boolean

  constructor() {
    this.configured = Boolean(process.env.OPENAI_API_KEY?.trim())
  }

  async transcribe(input: {
    audio: Buffer
    mimeType: string
    filename?: string
  }): Promise<TranscriptionResult> {
    const client = clientOrNull()
    if (!client) {
      return {
        text: '',
        confidence: null,
        language: null,
        duration_seconds: null,
        provider: this.name,
        data_status: 'unavailable',
        error: 'REALTIME_NOT_CONFIGURED',
        note: 'OPENAI_API_KEY is not configured.',
      }
    }
    try {
      const ext =
        input.mimeType.includes('mp4') || input.mimeType.includes('m4a')
          ? 'm4a'
          : input.mimeType.includes('ogg')
            ? 'ogg'
            : 'webm'
      const file = await toFile(input.audio, input.filename || `jarvis-voice.${ext}`, {
        type: input.mimeType || `audio/${ext}`,
      })
      const result = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
      })
      const text = (result as { text?: string }).text?.trim() || ''
      const language = (result as { language?: string }).language ?? null
      const duration =
        typeof (result as { duration?: number }).duration === 'number'
          ? (result as { duration: number }).duration
          : null
      return {
        text,
        confidence: null,
        language,
        duration_seconds: duration,
        provider: this.name,
        data_status: text ? 'verified' : 'unavailable',
        note: text ? undefined : 'Empty transcription.',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        text: '',
        confidence: null,
        language: null,
        duration_seconds: null,
        provider: this.name,
        data_status: 'failed',
        error: 'TRANSCRIPTION_FAILED',
        note: 'Voice transcription failed. Text Jarvis is still available.',
        // never surface raw provider auth errors with keys
        ...(msg.toLowerCase().includes('api key')
          ? {}
          : {}),
      }
    }
  }
}

export class OpenAITextToSpeechProvider implements TextToSpeechProvider {
  name = 'openai_tts'
  configured: boolean

  constructor() {
    this.configured = Boolean(process.env.OPENAI_API_KEY?.trim())
  }

  async synthesize(input: { text: string; voice?: string }): Promise<SynthesisResult> {
    const client = clientOrNull()
    if (!client) {
      return {
        audio_base64: null,
        content_type: 'audio/mpeg',
        provider: this.name,
        duration_seconds: null,
        data_status: 'unavailable',
        error: 'REALTIME_NOT_CONFIGURED',
        note: 'OPENAI_API_KEY is not configured.',
      }
    }
    const safe = sanitizeTextForSpeech(input.text)
    if (!safe) {
      return {
        audio_base64: null,
        content_type: 'audio/mpeg',
        provider: this.name,
        duration_seconds: null,
        data_status: 'unavailable',
        note: 'Nothing safe to speak.',
      }
    }
    try {
      const speech = await client.audio.speech.create({
        model: process.env.JARVIS_REALTIME_TTS_MODEL?.trim() || 'tts-1',
        voice: (input.voice as 'alloy') || 'alloy',
        input: safe,
        response_format: 'mp3',
      })
      const buf = Buffer.from(await speech.arrayBuffer())
      return {
        audio_base64: buf.toString('base64'),
        content_type: 'audio/mpeg',
        provider: this.name,
        duration_seconds: Math.min(60, Math.max(1, safe.length / 14)),
        data_status: 'verified',
      }
    } catch {
      return {
        audio_base64: null,
        content_type: 'audio/mpeg',
        provider: this.name,
        duration_seconds: null,
        data_status: 'failed',
        error: 'TTS_FAILED',
        note: 'Voice output failed. You can still read the text response.',
      }
    }
  }
}
