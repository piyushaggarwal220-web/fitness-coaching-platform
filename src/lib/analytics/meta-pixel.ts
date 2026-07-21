type MetaPixelEventOptions = {
  eventID?: string
}

type MetaPixelFunction = (
  action: 'track',
  eventName: string,
  parameters?: Record<string, unknown>,
  options?: MetaPixelEventOptions
) => void

declare global {
  interface Window {
    fbq?: MetaPixelFunction
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
