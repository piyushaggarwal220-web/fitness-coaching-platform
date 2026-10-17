'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { trackFunnelStep } from '@/lib/analytics/funnel'
import { metaBrowserIdsForRequest, persistMetaClickIdsFromLocation, readMetaBrowserIds } from '@/lib/analytics/meta-attribution'
import { queueMetaPurchase } from '@/lib/analytics/meta-pixel'
import { FIRST_PLAN_TARGET } from '@/lib/payments/plan-pages'
import { getCoachingPlan, isDurationOfferSlug } from '@/lib/payments/plans'
import { PREVIEW_SALE_CODE } from '@/lib/payments/preview-sale-code'
import { usePreviewSale } from './PreviewSaleCode'
import styles from './DirectCheckout.module.css'

type RazorpayResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type RazorpayInstance = { open: () => void }

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

function loadRazorpay() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Razorpay) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const found = document.querySelector<HTMLScriptElement>('script[data-lx-razorpay]')
    if (found) {
      found.addEventListener('load', () => resolve(), { once: true })
      found.addEventListener('error', () => reject(new Error('Razorpay checkout failed to load.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.lxRazorpay = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Razorpay checkout failed to load. Refresh and try again.'))
    document.body.appendChild(script)
  })
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, '')
  if (/^\+91\d{10}$/.test(digits)) return digits
  if (/^91\d{10}$/.test(digits)) return `+${digits}`
  if (/^\d{10}$/.test(digits)) return `+91${digits}`
  return ''
}

export function DirectCheckout({
  planSlug,
  landingPath,
  source,
  tone,
  onClose,
}: {
  planSlug: string | null
  landingPath: string
  source: string
  tone: 'beige' | 'purple' | 'colour'
  onClose: () => void
}) {
  const plan = planSlug ? getCoachingPlan(planSlug) : null
  const sale = usePreviewSale()
  const offer = plan && isDurationOfferSlug(plan.slug) ? sale.quote(plan.slug) : null
  const payLabel = offer?.payLabel ?? plan?.displayPrice ?? ''
  const payPaise = offer?.payPaise ?? plan?.amountPaise ?? 0
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
    persistMetaClickIdsFromLocation()
    trackFunnelStep('checkout_view', {
      plan: plan.slug,
      plan_name: plan.name,
      value: payPaise / 100,
      currency: 'INR',
      screen: 'landing',
      source,
      path: landingPath,
    })
    cardRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [plan, landingPath, source])

  if (!plan) return null

  async function pay(event: FormEvent) {
    event.preventDefault()
    if (!plan) return
    setError('')
    const cleanPhone = normalizePhone(phone)
    if (!name.trim() || !email.includes('@') || !cleanPhone || !agreed) {
      setError('Add your name, email, WhatsApp number, and accept the terms.')
      return
    }
    setLoading(true)
    persistMetaClickIdsFromLocation()
    trackFunnelStep('pay_click', {
      plan: plan.slug,
      plan_name: plan.name,
      value: payPaise / 100,
      currency: 'INR',
      source,
      path: landingPath,
    })
    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          email: email.trim(),
          name: name.trim(),
          phone: cleanPhone,
          policyAgreementAccepted: true,
          landingPath,
          discountCode: offer?.applied ? PREVIEW_SALE_CODE : undefined,
          ...metaBrowserIdsForRequest(),
        }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) throw new Error(orderData.error ?? 'Could not start checkout.')

      const finish = async (payload: RazorpayResponse) => {
        const metaIds = readMetaBrowserIds()
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planSlug: plan.slug,
            email: email.trim(),
            name: name.trim(),
            phone: cleanPhone,
            meta_fbp: metaIds.fbp,
            meta_fbc: metaIds.fbc,
            landingPath,
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
            content_name: `${plan.name} coaching plan`,
            content_ids: [plan.slug],
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

      await loadRazorpay()
      if (!window.Razorpay) throw new Error('Razorpay checkout failed to load.')
      const accent = tone === 'purple' ? '#7c3aed' : tone === 'colour' ? '#f59e0b' : '#1e4d3d'
      const checkout = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'LURVOX',
        description: `${plan.name} coaching`,
        order_id: orderData.orderId,
        prefill: { name: name.trim(), email: email.trim(), contact: cleanPhone },
        theme: { color: accent },
        handler: (response: RazorpayResponse) => {
          void finish(response).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Payment could not be confirmed.')
            setLoading(false)
          })
        },
        modal: { ondismiss: () => setLoading(false) },
      })
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className={`${styles.sheet} ${styles[tone]}`} role="presentation">
      <button type="button" className={styles.dim} aria-label="Close checkout" onClick={onClose} />
      <form ref={cardRef} className={styles.card} role="dialog" aria-modal="true" aria-labelledby="direct-checkout-title" tabIndex={-1} onSubmit={pay}>
        <button type="button" className={styles.back} onClick={onClose}>← Back</button>
        <p className={styles.kicker}>{plan.durationMonths === 1 ? '1 month' : `${plan.durationMonths} months`}</p>
        <h2 id="direct-checkout-title">{plan.name}</h2>
        <p className={styles.price}>
          {offer?.applied ? <s className={styles.was}>{offer.listLabel}</s> : null}
          {payLabel}
        </p>
        {offer ? (
          <button type="button" className={styles.code} onClick={sale.apply} disabled={offer.applied}>
            {offer.applied ? `${PREVIEW_SALE_CODE} applied` : `Apply ${PREVIEW_SALE_CODE}`}
          </button>
        ) : null}
        <p className={styles.note}>
          {payLabel} once. This is not a monthly charge. {FIRST_PLAN_TARGET}
          {plan.slug === 'offer_3_months'
            ? ' Includes a testosterone protocol for men and hourglass for women.'
            : ''}
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
        <label className={styles.check}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I agree to the <a href="/terms">Terms</a> and <a href="/refund-policy">Refund Policy</a>.
          </span>
        </label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button type="submit" className={styles.pay} disabled={loading}>
          {loading ? 'Opening checkout…' : 'Start your transformation'}
        </button>
        <button type="button" className={styles.close} onClick={onClose}>← Back</button>
      </form>
    </div>
  )
}
