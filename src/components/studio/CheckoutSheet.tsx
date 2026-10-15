'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { planName, planPrice, type StudioPlan } from './content'

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

  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!plan) return
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
        }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) {
        throw new Error(orderData.error ?? 'Could not start checkout.')
      }

      const finish = async (payload: RazorpayResponse) => {
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planSlug: plan!.slug,
            email: email.trim(),
            name: name.trim(),
            phone: cleanPhone,
            ...payload,
          }),
        })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok || !verifyData.success) {
          throw new Error(verifyData.error ?? 'Payment could not be confirmed. If money left your account, use the same email on the account setup page.')
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
      const checkout = new window.Razorpay({
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
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="st-sheet" role="presentation">
      <button type="button" className="st-sheet-dim" aria-label="Close checkout" onClick={onClose} />
      <form className="st-sheet-card" onSubmit={pay}>
        <p className="st-kicker">{plan.duration}</p>
        <h2>{planName(plan.slug)}</h2>
        <p className="st-sheet-price">{planPrice(plan.slug)}</p>
        <p className="st-quiet">Payment confirms the plan. Then you answer 25 questions and send photos. The coach writes it within 3 hours.</p>
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
        <button type="submit" className="st-btn st-btn-solid" disabled={loading}>
          {loading ? 'Opening checkout…' : `${plan.cta} — ${planPrice(plan.slug)}`}
        </button>
        <button type="button" className="st-text-btn" onClick={onClose}>Close</button>
      </form>
    </div>
  )
}
