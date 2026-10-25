'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { PREVIEW_AD_PATH } from '@/lib/analytics/ad-landing'
import { metaBrowserIdsForRequest, readMetaBrowserIds } from '@/lib/analytics/meta-attribution'
import { queueMetaPurchase } from '@/lib/analytics/meta-pixel'
import { COACHING_PLANS } from '@/lib/payments/plans'
import {
  bindRazorpayFailure,
  IN_APP_PAY_HINT,
  isInAppBrowser,
  loadRazorpayCheckout,
} from '@/lib/payments/load-razorpay'
import { FIRST_PLAN_TARGET, planName, planPrice, type StudioPlan } from './content'

type RazorpayResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type RazorpayInstance = { open: () => void; on?: (event: string, handler: (response: { error?: { description?: string } }) => void) => void }

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, '')
  if (/^\+91\d{10}$/.test(digits)) return digits
  if (/^91\d{10}$/.test(digits)) return `+${digits}`
  if (/^\d{10}$/.test(digits)) return `+91${digits}`
  return ''
}

export function CheckoutSheet({
  plan,
  onClose,
}: {
  plan: StudioPlan | null
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const cardRef = useRef<HTMLFormElement>(null)

  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!plan) return
    trackFunnelStep('checkout_view', {
      plan: plan.slug,
      plan_name: planName(plan.slug),
      value: COACHING_PLANS[plan.slug].amountPaise / 100,
      currency: 'INR',
      screen: 'studio',
      source: 'preview1',
    })
    cardRef.current?.focus()
    void loadRazorpayCheckout().catch(() => {})
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('.razorpay-container')) return
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [plan])

  if (!plan) return null

  async function pay(event: FormEvent) {
    event.preventDefault()
    setError('')
    const cleanPhone = normalizePhone(phone)
    if (!name.trim() || !email.includes('@') || !cleanPhone || !agreed) {
      setError('Add your name, email, WhatsApp number, and accept the terms.')
      return
    }
    setLoading(true)
    trackFunnelStep('pay_click', {
      plan: plan!.slug,
      plan_name: planName(plan!.slug),
      value: COACHING_PLANS[plan!.slug].amountPaise / 100,
      currency: 'INR',
      source: 'preview1',
    })
    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan!.slug,
          email: email.trim(),
          name: name.trim(),
          phone: cleanPhone,
          policyAgreementAccepted: true,
          landingPath: PREVIEW_AD_PATH,
          ...metaBrowserIdsForRequest(),
        }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) {
        throw new Error(orderData.error ?? 'Could not start checkout.')
      }

      const finish = async (payload: RazorpayResponse) => {
        const metaIds = readMetaBrowserIds()
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planSlug: plan!.slug,
            email: email.trim(),
            name: name.trim(),
            phone: cleanPhone,
            meta_fbp: metaIds.fbp,
            meta_fbc: metaIds.fbc,
            landingPath: PREVIEW_AD_PATH,
            ...payload,
          }),
        })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok || !verifyData.success) {
          throw new Error(verifyData.error ?? 'Payment could not be confirmed. If money left your account, use the same email on the account setup page.')
        }
        const chargedRupees = typeof orderData.amount === 'number' && orderData.amount > 0 ? orderData.amount / 100 : null
        if (!orderData.testMode && chargedRupees != null && !payload.razorpay_payment_id.startsWith('test_')) {
          queueMetaPurchase({
            eventID: `razorpay_${payload.razorpay_payment_id}`,
            value: chargedRupees,
            currency: 'INR',
            content_name: `${planName(plan!.slug)} coaching plan`,
            content_ids: [plan!.slug],
            content_type: 'product',
          })
        }
        window.location.replace(verifyData.redirectTo ?? '/create-account')
      }

      if (orderData.testMode) {
        await finish({
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: `test_payment_${Date.now()}`,
          razorpay_signature: 'test_signature',
        })
        return
      }

      await loadRazorpayCheckout()
      const RazorpayCheckout = window.Razorpay
      if (!RazorpayCheckout) throw new Error('Razorpay checkout failed to load.')
      const checkout = new RazorpayCheckout({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'LURVOX',
        description: `${planName(plan!.slug)} coaching`,
        order_id: orderData.orderId,
        prefill: { name: name.trim(), email: email.trim(), contact: cleanPhone },
        theme: { color: '#FF5A1F' },
        handler: (response: RazorpayResponse) => {
          void finish(response).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Payment could not be confirmed.')
            setLoading(false)
          })
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      })
      bindRazorpayFailure(checkout, (message) => {
        setError(message)
        setLoading(false)
      })
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="st-sheet" role="presentation">
      <button type="button" className="st-sheet-dim" aria-label="Close checkout" onClick={onClose} />
      <form ref={cardRef} className="st-sheet-card" role="dialog" aria-modal="true" aria-labelledby="st-checkout-title" tabIndex={-1} onSubmit={pay}>
        <p className="st-kicker">{plan.duration}</p>
        <h2 id="st-checkout-title">{planName(plan.slug)}</h2>
        <p className="st-sheet-price">{planPrice(plan.slug)}</p>
        <dl className="st-order">
          <div>
            <dt>Payment</dt>
            <dd>{planPrice(plan.slug)} once for {plan.duration}. This is not a monthly subscription.</dd>
          </div>
          <div>
            <dt>After payment</dt>
            <dd>You complete the onboarding form and send front, side, and back photos. Photos are required unless that form marks them optional. {FIRST_PLAN_TARGET}</dd>
          </div>
        </dl>
        <p className="st-quiet">
          Photos are used to write the plan and are not published without separate consent. The <a href="/terms">Terms</a> describe how submissions are handled. Sales are final once payment is captured, except where the <a href="/refund-policy">Refund Policy</a> says otherwise.
        </p>
        <label>
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          WhatsApp number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" required />
        </label>
        <label className="st-check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I agree to the <a href="/terms">Terms</a> and <a href="/refund-policy">Refund Policy</a>.
          </span>
        </label>
        {error ? <p className="st-error" role="alert">{error}</p> : null}
        {isInAppBrowser() ? <p className="st-error" role="note">{IN_APP_PAY_HINT}</p> : null}
        <button type="submit" className="st-btn st-btn-solid" disabled={loading}>
          {loading ? 'Opening checkout…' : `${plan.cta} — ${planPrice(plan.slug)}`}
        </button>
        <button type="button" className="st-text-btn" onClick={onClose}>Close</button>
      </form>
    </div>
  )
}
