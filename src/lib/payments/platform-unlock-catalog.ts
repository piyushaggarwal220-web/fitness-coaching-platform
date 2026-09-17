import type { InstantFeature } from '@/lib/instant-feature-access'

export const PLATFORM_UNLOCK_SINGLE_PAISE = 9900
export const PLATFORM_UNLOCK_BUNDLE_PAISE = 19900

export const PLATFORM_UNLOCK_KIND = 'platform_feature_unlock'

export type PlatformUnlockSku =
  | 'unlock_tracker'
  | 'unlock_journey'
  | 'unlock_ai_chat'
  | 'unlock_platform_bundle'

export const PLATFORM_UNLOCK_SKUS: readonly PlatformUnlockSku[] = [
  'unlock_tracker',
  'unlock_journey',
  'unlock_ai_chat',
  'unlock_platform_bundle',
] as const

export const PLATFORM_UNLOCK_META: Record<
  PlatformUnlockSku,
  {
    label: string
    amountPaise: number
    features: InstantFeature[]
    feature?: InstantFeature
  }
> = {
  unlock_tracker: {
    label: 'Daily tracker unlock',
    amountPaise: PLATFORM_UNLOCK_SINGLE_PAISE,
    features: ['tracker'],
    feature: 'tracker',
  },
  unlock_journey: {
    label: 'Journey unlock',
    amountPaise: PLATFORM_UNLOCK_SINGLE_PAISE,
    features: ['journey'],
    feature: 'journey',
  },
  unlock_ai_chat: {
    label: 'AI coach chat unlock',
    amountPaise: PLATFORM_UNLOCK_SINGLE_PAISE,
    features: ['ai_chat'],
    feature: 'ai_chat',
  },
  unlock_platform_bundle: {
    label: 'Tracker + Journey + AI chat',
    amountPaise: PLATFORM_UNLOCK_BUNDLE_PAISE,
    features: ['tracker', 'journey', 'ai_chat'],
  },
}

export function isPlatformUnlockSku(value: string | null | undefined): value is PlatformUnlockSku {
  return Boolean(value && (PLATFORM_UNLOCK_SKUS as readonly string[]).includes(value))
}

export function skuForInstantFeature(feature: InstantFeature): PlatformUnlockSku {
  if (feature === 'tracker') return 'unlock_tracker'
  if (feature === 'journey') return 'unlock_journey'
  return 'unlock_ai_chat'
}

export function parsePlatformUnlockSku(raw: string | null | undefined): PlatformUnlockSku | null {
  if (isPlatformUnlockSku(raw)) return raw
  if (raw === 'tracker' || raw === 'journey' || raw === 'ai_chat') {
    return skuForInstantFeature(raw)
  }
  if (raw === 'bundle') return 'unlock_platform_bundle'
  return null
}
