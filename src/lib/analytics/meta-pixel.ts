type MetaPixelEventOptions = {
  eventID?: string
}

type MetaPixelFunction = (
  action: 'track' | 'trackCustom',
  eventName: string,
  parameters?: Record<string, unknown>,
  options?: MetaPixelEventOptions
) => void

declare global {
  interface Window {
    fbq?: MetaPixelFunction
    dataLayer?: Array<Record<string, unknown>>
  }
}

const PENDING_PURCHASE_KEY = 'lurvox_meta_pending_purchase'
const SENT_PURCHASE_PREFIX = 'lurvox_meta_purchase_sent_'

export type PendingMetaPurchase = {
  eventID: string
  value: number
  currency: string
  content_name: string
  content_ids: string[]
  content_type: string
  queuedAt: number
}

const DEFAULT_META_PIXEL_ID = '1195395326212201'

function browserPixelId(): string {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || DEFAULT_META_PIXEL_ID
}

export function trackMetaEvent(
  eventName: string,
  parameters?: Record<string, unknown>,
  options?: MetaPixelEventOptions
) {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', eventName, parameters, options)
}

export function trackMetaCustom(
  eventName: string,
  parameters?: Record<string, unknown>,
  options?: MetaPixelEventOptions
) {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('trackCustom', eventName, parameters, options)
}

function alreadySent(eventID: string): boolean {
  try {
    return sessionStorage.getItem(`${SENT_PURCHASE_PREFIX}${eventID}`) === '1'
  } catch {
    return false
  }
}

function markSent(eventID: string) {
  try {
    sessionStorage.setItem(`${SENT_PURCHASE_PREFIX}${eventID}`, '1')
    sessionStorage.removeItem(PENDING_PURCHASE_KEY)
  } catch {
    // ignore
  }
}

/** Image beacon backup when fbq is blocked or redirect kills the JS request. */
function firePurchaseImageBeacon(purchase: PendingMetaPurchase) {
  const id = browserPixelId()
  if (!/^\d+$/.test(id)) return

  const params = new URLSearchParams()
  params.set('id', id)
  params.set('ev', 'Purchase')
  params.set('noscript', '1')
  params.set('eid', purchase.eventID)
  params.set('cd[value]', String(purchase.value))
  params.set('cd[currency]', purchase.currency)
  params.set('cd[content_name]', purchase.content_name)
  params.set('cd[content_type]', purchase.content_type)
  for (const contentId of purchase.content_ids) {
    params.append('cd[content_ids]', contentId)
  }

  try {
    const img = new Image()
    img.src = `https://www.facebook.com/tr?${params.toString()}`
  } catch {
    // ignore
  }
}

function fireFbqPurchase(purchase: PendingMetaPurchase): boolean {
  if (alreadySent(purchase.eventID)) return true
  if (typeof window === 'undefined' || !window.fbq) return false

  window.fbq(
    'track',
    'Purchase',
    {
      value: purchase.value,
      currency: purchase.currency,
      content_name: purchase.content_name,
      content_ids: purchase.content_ids,
      content_type: purchase.content_type,
    },
    { eventID: purchase.eventID }
  )
  markSent(purchase.eventID)
  return true
}

/** Queue Purchase so it survives checkout → create-account/login redirect. */
export function queueMetaPurchase(purchase: Omit<PendingMetaPurchase, 'queuedAt'>) {
  if (typeof window === 'undefined') return
  if (alreadySent(purchase.eventID)) return

  const pending: PendingMetaPurchase = { ...purchase, queuedAt: Date.now() }
  try {
    sessionStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(pending))
  } catch {
    // ignore
  }

  // Image beacon once (survives redirect better than a lone fbq call).
  firePurchaseImageBeacon(pending)
  // Best-effort fbq before navigate; flushPendingMetaPurchase retries next page.
  fireFbqPurchase(pending)
}

/** Call on post-checkout pages (and root layout) until Purchase lands. */
export function flushPendingMetaPurchase(): boolean {
  if (typeof window === 'undefined') return false

  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(PENDING_PURCHASE_KEY)
  } catch {
    return false
  }
  if (!raw) return false

  let purchase: PendingMetaPurchase
  try {
    purchase = JSON.parse(raw) as PendingMetaPurchase
  } catch {
    return false
  }

  if (!purchase?.eventID) return false
  // Drop stale queues (> 2h)
  if (purchase.queuedAt && Date.now() - purchase.queuedAt > 2 * 60 * 60 * 1000) {
    try {
      sessionStorage.removeItem(PENDING_PURCHASE_KEY)
    } catch {
      // ignore
    }
    return false
  }

  return fireFbqPurchase(purchase)
}
