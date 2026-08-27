export type WearableSource = 'apple_watch' | 'galaxy_watch' | 'fitbit'

export const WEARABLE_STORAGE_KEY = 'lurvox_wearable_source'

export const WEARABLE_OPTIONS: {
  id: WearableSource
  label: string
  short: string
}[] = [
  { id: 'apple_watch', label: 'Apple Watch', short: 'Apple' },
  { id: 'galaxy_watch', label: 'Galaxy Watch', short: 'Galaxy' },
  { id: 'fitbit', label: 'Fitbit', short: 'Fitbit' },
]

export function isWearableSource(value: string | null | undefined): value is WearableSource {
  return value === 'apple_watch' || value === 'galaxy_watch' || value === 'fitbit'
}

export function readStoredWearableSource(): WearableSource | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(WEARABLE_STORAGE_KEY)
    return isWearableSource(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredWearableSource(source: WearableSource) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WEARABLE_STORAGE_KEY, source)
  } catch {
    // private mode
  }
}

export function wearableLabel(source: WearableSource | null | undefined): string {
  return WEARABLE_OPTIONS.find((option) => option.id === source)?.label ?? 'Watch'
}

export function wearableHelp(source: WearableSource): string {
  if (source === 'apple_watch') {
    return 'Safari cannot read Apple Health. Open the Fitness app, copy today\'s numbers here, or use Fitbit if you want browser connect. Automatic Apple Watch pull needs a native iOS app later.'
  }
  if (source === 'galaxy_watch') {
    return 'Samsung Health / Health Connect are Android-only. Open the Galaxy Wearable or Samsung Health app and enter today\'s numbers here. Automatic pull needs a native Android app later.'
  }
  return 'Fitbit can connect in the browser. If connect is not set up yet, open the Fitbit app and enter today\'s numbers here.'
}
