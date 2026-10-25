const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'
const LOAD_TIMEOUT_MS = 10_000
const POLL_MS = 50

export const IN_APP_PAY_HINT =
  'Instagram, Facebook, and WhatsApp in-app browsers often hide the payment form. Open this page in Chrome or Safari, then pay.'

export type RazorpayFailureHandler = (message: string) => void

export type RazorpayCheckoutInstance = {
  open: () => void
  on?: (event: string, handler: (response: { error?: { description?: string } }) => void) => void
}

export type RazorpayCheckoutConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor
  }
}

function razorpayAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.Razorpay === 'function'
}

/** Meta/Instagram/WhatsApp webviews. Razorpay's modal often never appears here. */
export function isInAppBrowser(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|MicroMessenger|WhatsApp|\[wv\]|; wv\)/i.test(userAgent)
}

export function bindRazorpayFailure(checkout: RazorpayCheckoutInstance, onFail: RazorpayFailureHandler) {
  checkout.on?.('payment.failed', (response) => {
    onFail(response?.error?.description ?? 'Payment failed. Try another method.')
  })
}

/**
 * Load Razorpay checkout.js once. Safe if the script is already in the page
 * (Next.js <Script>, a cached tag, or a previous click). Never waits forever.
 */
export async function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Razorpay checkout can only open in the browser.')
  }
  if (razorpayAvailable()) return

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.clearInterval(poll)
      if (error) reject(error)
      else resolve()
    }

    const timer = window.setTimeout(() => {
      if (razorpayAvailable()) finish()
      else finish(new Error('Razorpay checkout failed to load. Refresh and try again.'))
    }, LOAD_TIMEOUT_MS)

    const poll = window.setInterval(() => {
      if (razorpayAvailable()) finish()
    }, POLL_MS)

    const attach = (script: HTMLScriptElement) => {
      script.addEventListener(
        'load',
        () => {
          if (razorpayAvailable()) finish()
          else finish(new Error('Razorpay checkout failed to load. Refresh and try again.'))
        },
        { once: true }
      )
      script.addEventListener(
        'error',
        () => finish(new Error('Razorpay checkout failed to load. Refresh and try again.')),
        { once: true }
      )
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src*="checkout.razorpay.com/v1/checkout.js"]`)
    if (existing) {
      const readyState = (existing as HTMLScriptElement & { readyState?: string }).readyState
      const done = readyState === 'complete' || readyState === 'loaded'
      if (done && !razorpayAvailable()) {
        existing.remove()
      } else {
        attach(existing)
        if (razorpayAvailable()) finish()
        return
      }
    }

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.dataset.lxRazorpay = '1'
    attach(script)
    document.body.appendChild(script)
  })

  if (!razorpayAvailable()) {
    throw new Error('Razorpay checkout failed to load. Refresh and try again.')
  }
}
