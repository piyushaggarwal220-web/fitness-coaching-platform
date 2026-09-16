'use client'

import Link from 'next/link'
import { BRAND_NAME } from '@/lib/brand'
import { DIGITAL_PLAN_LIST } from '@/lib/payments/plans'

const BLUE = '#2563EB'
const INK = '#0F172A'
const MUTED = '#475569'

export default function CustomisedPlanLandingPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse 90% 55% at 50% -15%, rgba(37,99,235,0.18), transparent 55%), #F4F8FF',
        color: INK,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: INK,
          color: '#fff',
          textAlign: 'center',
          padding: '10px 12px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        One-time payment · No subscriptions · Digital delivery
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '40px 20px 80px' }}>
        <p style={{ margin: 0, fontWeight: 900, letterSpacing: '0.14em', fontSize: 14 }}>{BRAND_NAME}</p>
        <p
          style={{
            margin: '18px 0 0',
            display: 'inline-flex',
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(37,99,235,0.12)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.06em',
          }}
        >
          PERSONALIZED FITNESS PLANS
        </p>
        <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(2rem, 6vw, 3.4rem)', lineHeight: 1.05, fontWeight: 900 }}>
          Your fitness plan.{' '}
          <span style={{ color: BLUE }}>Made for you.</span>
        </h1>
        <p style={{ margin: '14px 0 0', maxWidth: 560, color: MUTED, fontSize: 17, lineHeight: 1.5 }}>
          Personalized workout and diet plans built around your goals, lifestyle and preferences —
          from just ₹49. AI-built, delivered by email and in the app within a few hours. Not live coaching.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 36,
          }}
        >
          {DIGITAL_PLAN_LIST.map((plan) => (
            <div
              key={plan.slug}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: 20,
                border: plan.popular ? `2px solid ${BLUE}` : '1px solid rgba(37,99,235,0.14)',
                boxShadow: '0 12px 32px rgba(15,23,42,0.06)',
              }}
            >
              {plan.popular ? (
                <p style={{ margin: '0 0 8px', color: BLUE, fontSize: 12, fontWeight: 800 }}>Most popular</p>
              ) : null}
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{plan.name}</h2>
              <p style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 900 }}>{plan.displayPrice}</p>
              <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 14 }}>{plan.saveLabel}</p>
              <Link
                href={`/checkout?plan=${plan.slug}`}
                style={{
                  display: 'block',
                  marginTop: 18,
                  textAlign: 'center',
                  textDecoration: 'none',
                  background: BLUE,
                  color: '#fff',
                  fontWeight: 800,
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                Get plan →
              </Link>
            </div>
          ))}
        </div>

        <ol style={{ margin: '48px 0 0', paddingLeft: 18, color: MUTED, lineHeight: 1.7 }}>
          <li>Pay once with Razorpay (UPI / cards).</li>
          <li>Verify email and complete short onboarding in the app.</li>
          <li>Receive your customised plan by email and in My Plan within a few hours.</li>
        </ol>
      </div>
    </main>
  )
}
