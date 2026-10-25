/** Preview 4/5/6 hero sale clock. Starts at 5 hours, then starts again when it ends. */
export const PREVIEW_SALE_CYCLE_MS = 5 * 60 * 60 * 1000
export const PREVIEW_SALE_STORAGE_KEY = 'lurvox-preview456-sale-v2'

type ClockStorage = Pick<Storage, 'getItem' | 'setItem'> | null

/**
 * Remaining ms until this browser's sale window ends.
 * A missing or expired end time starts a fresh 5-hour window.
 */
export function previewSaleRemainingMs(now = Date.now(), storage?: ClockStorage): number {
  const store =
    storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : storage

  let end = 0
  try {
    const raw = store?.getItem(PREVIEW_SALE_STORAGE_KEY)
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
    if (Number.isFinite(parsed)) end = parsed
  } catch {
    end = 0
  }

  if (!end || end <= now) {
    end = now + PREVIEW_SALE_CYCLE_MS
    try {
      store?.setItem(PREVIEW_SALE_STORAGE_KEY, String(end))
    } catch {
      /* ignore private mode */
    }
  }

  return Math.max(0, end - now)
}
