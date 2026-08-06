/** Shared storefront sale countdown (localStorage) — matches Shopify offer strip. */
export const SALE_COUNTDOWN_STORAGE_KEY = 'lurvox-sale-countdown-v1'
export const SALE_COUNTDOWN_START_HOURS = 8
export const SALE_COUNTDOWN_FLOOR_HOURS = 5

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function formatCountdownHms(ms: number): string {
  const safe = Math.max(0, ms)
  const h = Math.floor(safe / 3_600_000)
  const m = Math.floor((safe % 3_600_000) / 60_000)
  const s = Math.floor((safe % 60_000) / 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/** Returns remaining ms until sale end, looping when at/under floor. */
export function getSaleCountdownRemainingMs(
  now = Date.now(),
  opts?: {
    storageKey?: string
    startHours?: number
    floorHours?: number
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  },
): number {
  const storageKey = opts?.storageKey ?? SALE_COUNTDOWN_STORAGE_KEY
  const startHours = opts?.startHours ?? SALE_COUNTDOWN_START_HOURS
  let floorHours = opts?.floorHours ?? SALE_COUNTDOWN_FLOOR_HOURS
  if (floorHours >= startHours) floorHours = Math.max(0, startHours - 1)

  const startMs = startHours * 3_600_000
  const floorMs = floorHours * 3_600_000
  const storage = opts?.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)

  let endTime = 0
  try {
    const stored = storage?.getItem(storageKey)
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN
    if (Number.isFinite(parsed) && parsed > now) endTime = parsed
  } catch {
    /* ignore */
  }

  if (!endTime) {
    endTime = now + startMs
    try {
      storage?.setItem(storageKey, String(endTime))
    } catch {
      /* ignore */
    }
  }

  let distance = endTime - now
  if (distance <= floorMs) {
    endTime = now + startMs
    try {
      storage?.setItem(storageKey, String(endTime))
    } catch {
      /* ignore */
    }
    distance = startMs
  }

  return distance
}
