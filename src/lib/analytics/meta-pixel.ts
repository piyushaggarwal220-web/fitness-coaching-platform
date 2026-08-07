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
