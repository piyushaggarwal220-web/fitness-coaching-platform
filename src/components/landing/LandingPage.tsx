'use client'

import { useEffect, useState } from 'react'
import { PreviewAdCapture } from '@/components/studio/PreviewAdCapture'
import { PREVIEW4_AD_PATH, PREVIEW4_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'
import { DURATION_OFFER_PLANS, type DurationOfferSlug } from '@/lib/payments/plans'
import { DirectCheckout } from './DirectCheckout'
import {
  Coaching,
  FaqSection,
  FinalCta,
  Footer,
  Hero,
  Method,
  Nav,
  Pricing,
  System,
  WhyFail,
} from './sections'
import { PrimaryCta } from './primitives'

export function LandingPage() {
  const [slug, setSlug] = useState<DurationOfferSlug>('offer_3_months')
  const [payPlan, setPayPlan] = useState<string | null>(null)
  const selected = DURATION_OFFER_PLANS[slug]

  useEffect(() => {
    const pricing = document.getElementById('pricing')
    const heroCta = document.querySelector('.lx-hero .lx-actions')
    const bar = document.querySelector('.lx-sticky')
    if (!pricing || !heroCta || !bar) return
    const seen = { hero: true, pricing: false }
    const sync = () => bar.classList.toggle('is-hidden', seen.hero || seen.pricing)
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === heroCta) seen.hero = entry.isIntersecting
        if (entry.target === pricing) seen.pricing = entry.isIntersecting
      }
      sync()
    }, { threshold: 0.35 })
    observer.observe(heroCta)
    observer.observe(pricing)
    sync()
    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing lx-duration">
      <PreviewAdCapture
        path={PREVIEW4_AD_PATH}
        sections={PREVIEW4_DROPOFF_SECTIONS}
        funnelSource="preview4"
        viewKey="lx_preview4_view"
      />
      <Nav />
      <main>
        <Hero slug={slug} onChange={setSlug} onPay={setPayPlan} />
        <WhyFail />
        <System />
        <Coaching />
        <Method />
        <Pricing onPay={setPayPlan} />
        <FaqSection />
        <FinalCta onPay={setPayPlan} />
      </main>
      <Footer />
      <div className="lx-sticky">
        <PrimaryCta plan={slug} className="lx-btn-block" source="preview4" landingPath="/preview4" onPay={setPayPlan}>
          Start for {selected.displayPrice}
        </PrimaryCta>
      </div>
      <DirectCheckout
        planSlug={payPlan}
        landingPath="/preview4"
        source="preview4"
        tone="beige"
        onClose={() => setPayPlan(null)}
      />
    </div>
  )
}
