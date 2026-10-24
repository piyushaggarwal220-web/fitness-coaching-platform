const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'
const LOAD_TIMEOUT_MS = 10_000

function razorpayAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.Razorpay === 'function'
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
      if (error) reject(error)
      else resolve()
    }

    const timer = window.setTimeout(() => {
      if (razorpayAvailable()) finish()
      else finish(new Error('Razorpay checkout failed to load. Refresh and try again.'))
    }, LOAD_TIMEOUT_MS)

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
      attach(existing)
      if (razorpayAvailable()) finish()
      return
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
