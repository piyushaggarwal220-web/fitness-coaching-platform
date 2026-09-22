/**
 * Resolve STT/TTS providers from configuration.
 */

import { realtimeEnabled, realtimeProviderName } from '@/lib/jarvis/realtime/config'
import {
  MockSpeechToTextProvider,
  MockTextToSpeechProvider,
  UnavailableSpeechToTextProvider,
  UnavailableTextToSpeechProvider,
} from '@/lib/jarvis/realtime/providers/mock'
import {
  OpenAISpeechToTextProvider,
  OpenAITextToSpeechProvider,
} from '@/lib/jarvis/realtime/providers/openai'
import type { SpeechToTextProvider, TextToSpeechProvider } from '@/lib/jarvis/realtime/providers/types'

export function getSpeechToTextProvider(): SpeechToTextProvider {
  if (!realtimeEnabled()) return new UnavailableSpeechToTextProvider()
  const name = realtimeProviderName()
  if (name === 'mock') return new MockSpeechToTextProvider()
  if (name === 'openai') {
    const p = new OpenAISpeechToTextProvider()
    return p.configured ? p : new UnavailableSpeechToTextProvider()
  }
  return new UnavailableSpeechToTextProvider()
}

export function getTextToSpeechProvider(): TextToSpeechProvider {
  if (!realtimeEnabled()) return new UnavailableTextToSpeechProvider()
  const name = realtimeProviderName()
  if (name === 'mock') return new MockTextToSpeechProvider()
  if (name === 'openai') {
    const p = new OpenAITextToSpeechProvider()
    return p.configured ? p : new UnavailableTextToSpeechProvider()
  }
  return new UnavailableTextToSpeechProvider()
}
