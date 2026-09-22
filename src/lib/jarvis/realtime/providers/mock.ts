/**
 * Deterministic mock providers for automated tests — never production.
 */

import type { SpeechToTextProvider, TextToSpeechProvider } from '@/lib/jarvis/realtime/providers/types'
import type { SynthesisResult, TranscriptionResult } from '@/lib/jarvis/realtime/types'

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  name = 'mock_stt'
  configured = true

  async transcribe(input: {
    audio: Buffer
    mimeType: string
  }): Promise<TranscriptionResult> {
    const marker = input.audio.toString('utf8')
    // Tests can embed transcript in the buffer as utf8 text
    const text =
      marker.startsWith('MOCK_TRANSCRIPT:')
        ? marker.slice('MOCK_TRANSCRIPT:'.length)
        : 'What needs my attention?'
    return {
      text,
      confidence: 0.99,
      language: 'en',
      duration_seconds: 1.2,
      provider: this.name,
      data_status: 'verified',
      note: 'Mock STT — not a real transcription.',
    }
  }
}

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  name = 'mock_tts'
  configured = true

  async synthesize(input: { text: string }): Promise<SynthesisResult> {
    // Minimal silent-ish WAV header + note — clients treat as audio/wav
    const payload = Buffer.from(`MOCK_TTS:${input.text.slice(0, 80)}`, 'utf8')
    return {
      audio_base64: payload.toString('base64'),
      content_type: 'audio/wav',
      provider: this.name,
      duration_seconds: Math.min(30, Math.max(1, input.text.length / 14)),
      data_status: 'verified',
      note: 'Mock TTS — not real speech audio.',
    }
  }
}

export class UnavailableSpeechToTextProvider implements SpeechToTextProvider {
  name = 'unavailable_stt'
  configured = false

  async transcribe(): Promise<TranscriptionResult> {
    return {
      text: '',
      confidence: null,
      language: null,
      duration_seconds: null,
      provider: this.name,
      data_status: 'unavailable',
      note: 'Speech-to-text is NOT CONFIGURED.',
      error: 'REALTIME_NOT_CONFIGURED',
    }
  }
}

export class UnavailableTextToSpeechProvider implements TextToSpeechProvider {
  name = 'unavailable_tts'
  configured = false

  async synthesize(): Promise<SynthesisResult> {
    return {
      audio_base64: null,
      content_type: 'audio/mpeg',
      provider: this.name,
      duration_seconds: null,
      data_status: 'unavailable',
      note: 'Text-to-speech is NOT CONFIGURED.',
      error: 'REALTIME_NOT_CONFIGURED',
    }
  }
}
