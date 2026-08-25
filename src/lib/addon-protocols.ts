import { CHECKOUT_ADDONS, type CheckoutAddonId } from '@/lib/payments/checkout-discounts'

export const ADDON_PROTOCOL_IDS = ['testo_boost', 'anxiety_removal', 'face_maxxing'] as const
export type AddonProtocolId = (typeof ADDON_PROTOCOL_IDS)[number]

export const ADDON_PROTOCOL_HREF: Record<AddonProtocolId, string> = {
  testo_boost: '/supplement-protocol?addon=testo_boost',
  anxiety_removal: '/supplement-protocol?addon=anxiety_removal',
  face_maxxing: '/supplement-protocol?addon=face_maxxing',
}

export const ADDON_PROTOCOL_PAGE_TITLE: Record<AddonProtocolId, string> = {
  testo_boost: 'Testo boost',
  anxiety_removal: 'Anxiety removal',
  face_maxxing: 'Face maxxing',
}

export const ADDON_PROTOCOL_SUBTITLE: Record<AddonProtocolId, string> = {
  testo_boost: 'Training, sleep, nutrition and supplements',
  anxiety_removal: 'Stress, sleep and calmer-week habits',
  face_maxxing: 'Sleep, salt, skin, posture and grooming',
}

export function parseAddonProtocolId(raw: string | null | undefined): AddonProtocolId {
  if (raw === 'anxiety_removal' || raw === 'face_maxxing' || raw === 'testo_boost') return raw
  return 'testo_boost'
}

export function addonProtocolName(id: AddonProtocolId): string {
  return CHECKOUT_ADDONS.find((item) => item.id === id)?.name ?? ADDON_PROTOCOL_PAGE_TITLE[id]
}

export function isAddonProtocolId(id: CheckoutAddonId | string): id is AddonProtocolId {
  return (ADDON_PROTOCOL_IDS as readonly string[]).includes(id)
}

export function profileEntitledForAddon(
  profile: {
    supplement_protocol_entitled?: boolean | null
    anxiety_protocol_entitled?: boolean | null
    face_maxxing_entitled?: boolean | null
  } | null | undefined,
  id: AddonProtocolId
): boolean {
  if (!profile) return false
  if (id === 'testo_boost') return profile.supplement_protocol_entitled === true
  if (id === 'anxiety_removal') return profile.anxiety_protocol_entitled === true
  return profile.face_maxxing_entitled === true
}

export function entitledAddonIds(profile: {
  supplement_protocol_entitled?: boolean | null
  anxiety_protocol_entitled?: boolean | null
  face_maxxing_entitled?: boolean | null
} | null | undefined): AddonProtocolId[] {
  return ADDON_PROTOCOL_IDS.filter((id) => profileEntitledForAddon(profile, id))
}

export function profileEntitledForExerciseLibrary(
  profile: { exercise_library_entitled?: boolean | null } | null | undefined
): boolean {
  return profile?.exercise_library_entitled === true
}
