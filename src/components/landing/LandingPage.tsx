'use client'

import { useEffect, useState } from 'react'
import { COACHING_PLANS, type CoachingPlanSlug } from '@/lib/payments/plans'
import {
  Coaching,
  FaqSection,
  FinalCta,
  Footer,
  Hero,
  Included,
  Method,
  Nav,
  Pricing,
  System,
} from './sections'
import { PrimaryCta } from './primitives'

export function LandingPage() {
  const [slug, setSlug] = useState<CoachingPlanSlug>('3_months')
  const selected = COACHING_PLANS[slug]

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
    <div className="landing">
      <Nav />
      <main>
        <Hero slug={slug} onChange={setSlug} />
        <Included />
        <System />
        <Coaching />
        <Method />
        <Pricing />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
      <div className="lx-sticky">
        <PrimaryCta plan={slug} className="lx-btn-block">
          Start for {selected.displayPrice}
        </PrimaryCta>
      </div>
    </div>
  )
}
