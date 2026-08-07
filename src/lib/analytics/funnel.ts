import { trackMetaEvent } from '@/lib/analytics/meta-pixel'

type FunnelParams = Record<string, unknown>

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
    fbq?: (
      action: 'track' | 'trackCustom',
      eventName: string,
      parameters?: Record<string, unknown>,
      options?: { eventID?: string }
    ) => void
  }
}

function pushDataLayer(event: string, params?: FunnelParams) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...params })
}

export function trackMetaCustom(eventName: string, parameters?: FunnelParams) {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('trackCustom', eventName, parameters)
}

/** Funnel steps for ads + Meta + GTM-style dataLayer. */
export function trackFunnelStep(
  step:
    | 'view_landing'
    | 'view_plans'
    | 'plan_click'
    | 'talk_to_coach'
    | 'checkout_view'
    | 'checkout_plan_switch'
    | 'pay_click'
    | 'purchase',
  params?: FunnelParams
) {
  const payload = { funnel_step: step, ...params }
  pushDataLayer(`lurvox_${step}`, payload)
  trackMetaCustom(`Lurvox_${step}`, payload)

  if (step === 'plan_click') {
    trackMetaEvent('AddToCart', {
      content_type: 'product',
      content_ids: params?.plan ? [params.plan] : undefined,
      content_name: params?.plan_name,
      value: params?.value,
      currency: 'INR',
    })
  }
  if (step === 'checkout_view') {
    trackMetaEvent('InitiateCheckout', {
      content_type: 'product',
      content_ids: params?.plan ? [params.plan] : undefined,
      content_name: params?.plan_name,
      value: params?.value,
      currency: 'INR',
    })
  }
  if (step === 'talk_to_coach') {
    trackMetaEvent('Contact', payload)
  }
}
